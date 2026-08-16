package ai.webwaifu.mobile.network

import ai.webwaifu.mobile.model.FrequencyBands
import ai.webwaifu.mobile.model.LipSyncFrame
import ai.webwaifu.mobile.model.MouthWeights
import kotlin.math.PI
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.round
import kotlin.math.sin
import kotlin.math.sqrt
import org.json.JSONObject

/**
 * Native Kotlin port of the wLipSync/uLipSync analysis path used by Waifu4.
 *
 * It consumes the exact checked-in Waifu4 calibration profile and follows the same rolling-window
 * downsample, pre-emphasis, Hamming, FFT, mel bank, DCT, cosine classifier, volume mapping, and
 * critically damped A/I/U/E/O smoothing. Analysis runs at ~43 Hz instead of the browser worklet's
 * ~172 Hz to keep the pure-Kotlin path efficient on mobile; the VRM render loop interpolates the
 * resulting weights at display rate.
 */
internal class NativeLipSyncAnalyzer private constructor(
    private val inputSampleRate: Int,
    private val profile: Profile,
) {
    private val inputWindowSize =
        ceil(profile.sampleCount * inputSampleRate.toDouble() / profile.targetSampleRate).toInt()
    private val ring = FloatArray(inputWindowSize)
    private var ringIndex = 0
    private var ringCount = 0
    private var samplesSinceAnalysis = 0
    private val weights = linkedMapOf<String, Double>()
    private val velocities = linkedMapOf<String, Double>()
    private var volume = 0.0
    private var volumeVelocity = 0.0

    init {
        profile.labels.distinct().forEach { name ->
            weights[name] = 0.0
            velocities[name] = 0.0
        }
    }

    fun consume(
        pcm: ByteArray,
        startOffset: Int = 0,
        length: Int = pcm.size - startOffset,
    ): List<LipSyncFrame> {
        if (length < 2) return emptyList()
        val frames = ArrayList<LipSyncFrame>()
        var offset = startOffset.coerceAtLeast(0)
        val end = (startOffset + length).coerceAtMost(pcm.size)
        while (offset + 1 < end) {
            val low = pcm[offset].toInt() and 0xff
            val high = pcm[offset + 1].toInt()
            val signed = (high shl 8) or low
            ring[ringIndex] = signed / 32768f
            ringIndex = (ringIndex + 1) % ring.size
            ringCount = min(ringCount + 1, ring.size)
            samplesSinceAnalysis += 1
            if (samplesSinceAnalysis >= ANALYSIS_STRIDE_SAMPLES) {
                samplesSinceAnalysis = 0
                frames += analyze()
            }
            offset += 2
        }
        return frames
    }

    fun reset(): LipSyncFrame {
        ring.fill(0f)
        ringIndex = 0
        ringCount = 0
        samplesSinceAnalysis = 0
        weights.keys.forEach {
            weights[it] = 0.0
            velocities[it] = 0.0
        }
        volume = 0.0
        volumeVelocity = 0.0
        return LipSyncFrame()
    }

    private fun analyze(): LipSyncFrame {
        val source = chronologicalWindow()
        val rms = sqrt(source.sumOf { sample -> sample.toDouble() * sample } / source.size)
        val data = resampleForProfile(source)

        preEmphasis(data, 0.97)
        hamming(data)
        normalize(data)
        val spectrum = fftMagnitude(data)
        val bands = frequencyBands(spectrum)
        val mel = melFilterBank(spectrum)
        for (index in mel.indices) {
            mel[index] = 10.0 * log10(max(mel[index], 1e-30))
        }
        val cepstrum = dct(mel)
        val mfcc = DoubleArray(MFCC_COUNT) { index -> cepstrum[index + 1] }
        val classifiedName = classify(mfcc)

        val deltaSeconds = ANALYSIS_STRIDE_SAMPLES.toDouble() / inputSampleRate
        val rawVolume =
            if (rms <= 0.0) {
                0.0
            } else {
                ((log10(rms) - MIN_LOG_VOLUME) / (MAX_LOG_VOLUME - MIN_LOG_VOLUME))
                    .coerceIn(0.0, 1.0)
            }
        smoothDamp(
            current = volume,
            target = rawVolume,
            velocity = volumeVelocity,
            smoothTime = WORKLET_SMOOTHNESS,
            deltaTime = deltaSeconds,
        ).also {
            volume = it.first
            volumeVelocity = it.second
        }

        weights.keys.forEach { name ->
            val result =
                smoothDamp(
                    current = weights.getValue(name),
                    target = if (name == classifiedName) 1.0 else 0.0,
                    velocity = velocities.getValue(name),
                    smoothTime = WORKLET_SMOOTHNESS,
                    deltaTime = deltaSeconds,
                )
            weights[name] = result.first
            velocities[name] = result.second
        }

        return LipSyncFrame(
            amplitude = (rms * 3.2).toFloat().coerceIn(0f, 1f),
            mouthWeights =
                MouthWeights(
                    aa = ((weights["A"] ?: 0.0) * volume).toFloat().coerceIn(0f, 1f),
                    ih = ((weights["I"] ?: 0.0) * volume).toFloat().coerceIn(0f, 1f),
                    ou = ((weights["U"] ?: 0.0) * volume).toFloat().coerceIn(0f, 1f),
                    ee = ((weights["E"] ?: 0.0) * volume).toFloat().coerceIn(0f, 1f),
                    oh = ((weights["O"] ?: 0.0) * volume).toFloat().coerceIn(0f, 1f),
                ),
            frequencyBands = bands,
        )
    }

    private fun chronologicalWindow(): FloatArray {
        val output = FloatArray(ring.size)
        if (ringCount < ring.size) {
            val padding = ring.size - ringCount
            for (index in 0 until ringCount) output[padding + index] = ring[index]
            return output
        }
        for (index in ring.indices) output[index] = ring[(ringIndex + index) % ring.size]
        return output
    }

    private fun resampleForProfile(source: FloatArray): DoubleArray {
        val filtered = DoubleArray(source.size) { source[it].toDouble() }
        lowPassFilter(filtered)
        val ratio = inputSampleRate.toDouble() / profile.targetSampleRate
        return DoubleArray(profile.sampleCount) { index ->
            filtered[floor(index * ratio).toInt().coerceIn(filtered.indices)]
        }
    }

    /**
     * Matches wLipSync's windowed-sinc low-pass stage, including its in-place additive behavior.
     */
    private fun lowPassFilter(data: DoubleArray) {
        val cutoff = (profile.targetSampleRate / 2.0 - LOW_PASS_RANGE) / inputSampleRate
        val range = LOW_PASS_RANGE / inputSampleRate
        var kernelLength = round(3.1 / range).toInt()
        if (kernelLength % 2 != 0) kernelLength += 1
        val original = data.copyOf()
        for (kernelIndex in 0 until kernelLength / 2) {
            val x = kernelIndex - (kernelLength - 1) / 2.0
            val angle = 2.0 * PI * cutoff * x
            val coefficient = 2.0 * cutoff * sin(angle) / angle
            for (sampleIndex in kernelIndex until data.size) {
                val first = sampleIndex - kernelIndex
                val second = sampleIndex - (kernelLength - 1 - kernelIndex)
                val firstValue = original.getOrElse(first) { 0.0 }
                val secondValue = original.getOrElse(second) { 0.0 }
                data[sampleIndex] += coefficient * (firstValue + secondValue)
            }
        }
    }

    private fun preEmphasis(
        data: DoubleArray,
        amount: Double,
    ) {
        for (index in data.lastIndex downTo 1) {
            data[index] -= amount * data[index - 1]
        }
    }

    private fun hamming(data: DoubleArray) {
        for (index in data.indices) {
            val x = index.toDouble() / data.lastIndex
            data[index] *= 0.54 - 0.46 * cos(2.0 * PI * x)
        }
    }

    private fun normalize(data: DoubleArray) {
        val peak = data.maxOf { kotlin.math.abs(it) }
        if (peak < 1e-8) return
        for (index in data.indices) data[index] /= peak
    }

    private fun fftMagnitude(input: DoubleArray): DoubleArray {
        val size = input.size
        val real = DoubleArray(size)
        val imaginary = DoubleArray(size)
        val bits = Integer.numberOfTrailingZeros(size)
        for (index in 0 until size) {
            real[Integer.reverse(index) ushr (32 - bits)] = input[index]
        }
        var halfSize = 1
        while (halfSize < size) {
            val stride = size / (halfSize * 2)
            for (base in 0 until size step halfSize * 2) {
                for (offset in 0 until halfSize) {
                    val angle = -2.0 * PI * (offset * stride) / size
                    val twiddleReal = cos(angle)
                    val twiddleImaginary = sin(angle)
                    val evenReal = real[base + offset]
                    val evenImaginary = imaginary[base + offset]
                    val oddReal = real[base + offset + halfSize]
                    val oddImaginary = imaginary[base + offset + halfSize]
                    val rotatedReal = twiddleReal * oddReal - twiddleImaginary * oddImaginary
                    val rotatedImaginary = twiddleReal * oddImaginary + twiddleImaginary * oddReal
                    real[base + offset] = evenReal + rotatedReal
                    imaginary[base + offset] = evenImaginary + rotatedImaginary
                    real[base + offset + halfSize] = evenReal - rotatedReal
                    imaginary[base + offset + halfSize] = evenImaginary - rotatedImaginary
                }
            }
            halfSize *= 2
        }
        return DoubleArray(size) { index ->
            sqrt(real[index] * real[index] + imaginary[index] * imaginary[index])
        }
    }

    private fun melFilterBank(spectrum: DoubleArray): DoubleArray {
        val output = DoubleArray(profile.melFilterBankChannels)
        val maxFrequency = profile.targetSampleRate / 2.0
        val melMax = toMel(maxFrequency)
        val maxBin = spectrum.size / 2
        val frequencyPerBin = maxFrequency / maxBin
        val melStep = melMax / (profile.melFilterBankChannels + 1)
        for (channel in output.indices) {
            val begin = toHz(melStep * channel)
            val center = toHz(melStep * (channel + 1))
            val end = toHz(melStep * (channel + 2))
            val beginBin = ceil(begin / frequencyPerBin).toInt()
            val centerBin = round(center / frequencyPerBin).toInt()
            val endBin = floor(end / frequencyPerBin).toInt()
            var sum = 0.0
            for (bin in beginBin + 1..min(endBin, maxBin)) {
                val frequency = frequencyPerBin * bin
                var scale =
                    if (bin < centerBin) {
                        (frequency - begin) / (center - begin)
                    } else {
                        (end - frequency) / (end - center)
                    }
                scale /= (end - begin) * 0.5
                sum += scale * spectrum[bin]
            }
            output[channel] = sum
        }
        return output
    }

    private fun dct(input: DoubleArray): DoubleArray =
        DoubleArray(input.size) { coefficient ->
            var sum = 0.0
            for (index in input.indices) {
                sum += input[index] * cos((index + 0.5) * coefficient * PI / input.size)
            }
            sum
        }

    private fun classify(mfcc: DoubleArray): String {
        var bestIndex = 0
        var bestScore = Double.NEGATIVE_INFINITY
        profile.averages.forEachIndexed { index, reference ->
            var product = 0.0
            var inputNorm = 0.0
            var referenceNorm = 0.0
            for (coefficient in 0 until MFCC_COUNT) {
                product += mfcc[coefficient] * reference[coefficient]
                inputNorm += mfcc[coefficient] * mfcc[coefficient]
                referenceNorm += reference[coefficient] * reference[coefficient]
            }
            val denominator = sqrt(inputNorm) * sqrt(referenceNorm)
            val similarity =
                if (denominator <= 1e-12) 0.0 else max(product / denominator, 0.0)
            val score = similarity.pow(100.0)
            if (score > bestScore) {
                bestScore = score
                bestIndex = index
            }
        }
        return profile.labels[bestIndex]
    }

    private fun frequencyBands(spectrum: DoubleArray): FrequencyBands {
        val half = spectrum.size / 2
        val peak = spectrum.take(half).maxOrNull()?.coerceAtLeast(1e-9) ?: 1.0
        fun average(startHz: Double, endHz: Double): Float {
            val start = floor(startHz * spectrum.size / profile.targetSampleRate).toInt()
            val end = ceil(endHz * spectrum.size / profile.targetSampleRate).toInt()
            if (start >= end) return 0f
            var sum = 0.0
            var count = 0
            for (index in start.coerceAtLeast(0) until end.coerceAtMost(half)) {
                sum += spectrum[index] / peak
                count += 1
            }
            return if (count == 0) 0f else (sum / count * 2.5).toFloat().coerceIn(0f, 1f)
        }
        return FrequencyBands(
            low = average(0.0, 861.0),
            midLow = average(861.0, 2239.0),
            midHigh = average(2239.0, 3445.0),
            high = average(3445.0, 6029.0),
        )
    }

    private fun toMel(hertz: Double): Double = 1127.0 * kotlin.math.ln(hertz / 700.0 + 1.0)

    private fun toHz(mel: Double): Double = 700.0 * (exp(mel / 1127.0) - 1.0)

    private data class Profile(
        val targetSampleRate: Int,
        val sampleCount: Int,
        val melFilterBankChannels: Int,
        val labels: List<String>,
        val averages: List<DoubleArray>,
    )

    companion object {
        private const val MFCC_COUNT = 12
        private const val ANALYSIS_STRIDE_SAMPLES = 1024
        private const val LOW_PASS_RANGE = 500.0
        private const val MIN_LOG_VOLUME = -2.5
        private const val MAX_LOG_VOLUME = -1.5
        private const val WORKLET_SMOOTHNESS = 0.03

        fun fromJson(
            json: String,
            inputSampleRate: Int,
        ): NativeLipSyncAnalyzer {
            val root = JSONObject(json)
            val entries = root.getJSONArray("mfccs")
            val labels = ArrayList<String>(entries.length())
            val averages = ArrayList<DoubleArray>(entries.length())
            for (entryIndex in 0 until entries.length()) {
                val entry = entries.getJSONObject(entryIndex)
                labels += entry.getString("name").uppercase()
                val samples = entry.getJSONArray("mfccCalibrationDataList")
                val average = DoubleArray(MFCC_COUNT)
                for (sampleIndex in 0 until samples.length()) {
                    val values = samples.getJSONObject(sampleIndex).getJSONArray("array")
                    for (coefficient in 0 until MFCC_COUNT) {
                        average[coefficient] += values.getDouble(coefficient)
                    }
                }
                for (coefficient in average.indices) {
                    average[coefficient] = average[coefficient] / samples.length().toDouble()
                }
                averages += average
            }
            return NativeLipSyncAnalyzer(
                inputSampleRate = inputSampleRate,
                profile =
                    Profile(
                        targetSampleRate = root.getInt("targetSampleRate"),
                        sampleCount = root.getInt("sampleCount"),
                        melFilterBankChannels = root.getInt("melFilterBankChannels"),
                        labels = labels,
                        averages = averages,
                    ),
            )
        }

        private fun smoothDamp(
            current: Double,
            target: Double,
            velocity: Double,
            smoothTime: Double,
            deltaTime: Double,
        ): Pair<Double, Double> {
            val omega = 2.0 / smoothTime
            val scaled = omega * deltaTime
            val exponential = 1.0 / (1.0 + scaled + 0.48 * scaled * scaled + 0.235 * scaled * scaled * scaled)
            val difference = current - target
            val temporary = (velocity + omega * difference) * deltaTime
            val nextVelocity = (velocity - omega * temporary) * exponential
            return (target + (difference + temporary) * exponential) to nextVelocity
        }
    }
}
