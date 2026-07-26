package ai.webwaifu.mobile.network

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import ai.webwaifu.mobile.model.FishLatency
import ai.webwaifu.mobile.model.LipSyncFrame
import java.util.concurrent.CountDownLatch
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString

class FishRealtimeClient(context: Context) {
    private val profileJson =
        context.assets.open("lipsync-profile.json").bufferedReader().use { it.readText() }

    @Volatile
    private var activeSession: Session? = null

    fun connect(
        apiKey: String,
        voiceId: String,
        model: String,
        sampleRate: Int,
        chunkLength: Int,
        latency: FishLatency,
        conditionOnPreviousChunks: Boolean,
        onLipSync: (LipSyncFrame) -> Unit,
        onFirstAudio: () -> Unit = {},
    ): Session {
        require(apiKey.isNotBlank()) { "Add a Fish Audio API key in Settings." }
        stop()
        return Session(
            apiKey = apiKey.trim(),
            voiceId = voiceId.trim(),
            model = model.trim(),
            sampleRate = sampleRate,
            chunkLength = chunkLength,
            latency = latency,
            conditionOnPreviousChunks = conditionOnPreviousChunks,
            profileJson = profileJson,
            onLipSync = onLipSync,
            onFirstAudio = onFirstAudio,
        ).also {
            activeSession = it
            it.connect()
        }
    }

    fun stop() {
        activeSession?.cancel()
        activeSession = null
    }

    class Session internal constructor(
        private val apiKey: String,
        private val voiceId: String,
        private val model: String,
        private val sampleRate: Int,
        private val chunkLength: Int,
        private val latency: FishLatency,
        private val conditionOnPreviousChunks: Boolean,
        profileJson: String,
        private val onLipSync: (LipSyncFrame) -> Unit,
        private val onFirstAudio: () -> Unit,
    ) {
        private val lipSyncAnalyzer = NativeLipSyncAnalyzer.fromJson(profileJson, sampleRate)
        private val openLatch = CountDownLatch(1)
        private val finishLatch = CountDownLatch(1)
        private val audioQueue = LinkedBlockingQueue<ByteArray>()
        private val cancelled = AtomicBoolean(false)
        private val firstAudioNotified = AtomicBoolean(false)
        private val stopRequested = AtomicBoolean(false)
        private val playerDone = CountDownLatch(1)
        private var failure: Throwable? = null
        private var socket: WebSocket? = null
        private var audioTrack: AudioTrack? = null
        private var playbackThread: Thread? = null

        fun connect() {
            startAudioPlayer()
            val request =
                Request.Builder()
                    .url(LIVE_URL)
                    .header("Authorization", "Bearer $apiKey")
                    .header("model", model.ifBlank { "s2-pro" })
                    .header("User-Agent", "WebWaifu-Mobile/0.1")
                    .build()
            socket = HTTP_CLIENT.newWebSocket(request, listener)
            if (!openLatch.await(20, TimeUnit.SECONDS)) {
                cancel()
                throw FishRealtimeException("Fish realtime WebSocket timed out while connecting.")
            }
            failure?.let {
                cancel()
                throw FishRealtimeException(it.message ?: "Fish realtime WebSocket failed.")
            }
        }

        fun sendText(text: String) {
            if (text.isBlank() || cancelled.get()) return
            send(mapOf("event" to "text", "text" to text))
            send(mapOf("event" to "flush"))
        }

        fun finish(timeoutSeconds: Long = 20) {
            if (cancelled.get()) return
            stopRequested.set(true)
            send(mapOf("event" to "stop"))
            if (!finishLatch.await(timeoutSeconds, TimeUnit.SECONDS)) {
                cancel()
                throw FishRealtimeException("Fish realtime WebSocket timed out while finishing.")
            }
            audioQueue.offer(END_OF_AUDIO)
            playerDone.await(10, TimeUnit.SECONDS)
            failure?.let { throw FishRealtimeException(it.message ?: "Fish realtime speech failed.") }
            socket?.close(1000, "complete")
        }

        fun cancel() {
            if (!cancelled.compareAndSet(false, true)) return
            socket?.cancel()
            socket = null
            audioQueue.clear()
            audioQueue.offer(END_OF_AUDIO)
            runCatching { audioTrack?.pause() }
            runCatching { audioTrack?.flush() }
            finishLatch.countDown()
            openLatch.countDown()
        }

        private fun send(message: Map<String, Any?>) {
            val sent = socket?.send(ByteString.of(*MessagePackCodec.encode(message))) == true
            if (!sent) throw FishRealtimeException("Fish realtime WebSocket is not connected.")
        }

        private fun sendStart(webSocket: WebSocket) {
            val request =
                linkedMapOf<String, Any?>(
                    "text" to "",
                    "format" to "pcm",
                    "sample_rate" to sampleRate,
                    "chunk_length" to chunkLength.coerceIn(100, 300),
                    "min_chunk_length" to 20,
                    "latency" to latency.name.lowercase(),
                    "normalize" to true,
                    "condition_on_previous_chunks" to conditionOnPreviousChunks,
                    "prosody" to mapOf("speed" to 1.0, "volume" to 0),
                )
            if (voiceId.isNotBlank()) {
                request["reference_id"] = voiceId
            }
            val payload =
                MessagePackCodec.encode(
                    mapOf(
                        "event" to "start",
                        "request" to request,
                    ),
                )
            if (!webSocket.send(ByteString.of(*payload))) {
                throw FishRealtimeException("Could not start Fish realtime speech.")
            }
        }

        private val listener =
            object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    runCatching { sendStart(webSocket) }
                        .onFailure {
                            failure = it
                            finishLatch.countDown()
                        }
                    openLatch.countDown()
                }

                override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
                    val decoded =
                        runCatching { MessagePackCodec.decode(bytes.toByteArray()) as? Map<*, *> }
                            .getOrElse {
                                failure = it
                                finishLatch.countDown()
                                return
                            }
                            ?: return
                    when (decoded["event"]?.toString()) {
                        "audio" -> {
                            val audio = decoded["audio"] as? ByteArray
                            if (audio != null && audio.isNotEmpty()) {
                                if (firstAudioNotified.compareAndSet(false, true)) {
                                    onFirstAudio()
                                }
                                audioQueue.offer(audio)
                            }
                        }
                        "finish" -> {
                            val reason = decoded["reason"]?.toString()
                            if (reason == "error") {
                                failure =
                                    FishRealtimeException(
                                        decoded["message"]?.toString()
                                            ?: "Fish realtime generation failed.",
                                    )
                            }
                            finishLatch.countDown()
                        }
                    }
                }

                override fun onFailure(
                    webSocket: WebSocket,
                    throwable: Throwable,
                    response: Response?,
                ) {
                    if (
                        !cancelled.get() &&
                        !(stopRequested.get() && firstAudioNotified.get())
                    ) {
                        failure = throwable
                    }
                    openLatch.countDown()
                    finishLatch.countDown()
                    audioQueue.offer(END_OF_AUDIO)
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    openLatch.countDown()
                    finishLatch.countDown()
                    audioQueue.offer(END_OF_AUDIO)
                }
            }

        private fun startAudioPlayer() {
            val minBuffer =
                AudioTrack.getMinBufferSize(
                    sampleRate,
                    AudioFormat.CHANNEL_OUT_MONO,
                    AudioFormat.ENCODING_PCM_16BIT,
                )
            val track =
                AudioTrack.Builder()
                    .setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                            .build(),
                    )
                    .setAudioFormat(
                        AudioFormat.Builder()
                            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                            .setSampleRate(sampleRate)
                            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                            .build(),
                    )
                    .setTransferMode(AudioTrack.MODE_STREAM)
                    .setBufferSizeInBytes(maxOf(minBuffer, 8_192))
                    .setSessionId(AudioManager.AUDIO_SESSION_ID_GENERATE)
                    .build()
            audioTrack = track
            playbackThread =
                Thread(
                    {
                        try {
                            track.play()
                            while (!cancelled.get()) {
                                val pcm = audioQueue.take()
                                if (pcm === END_OF_AUDIO) break
                                var offset = 0
                                while (offset < pcm.size && !cancelled.get()) {
                                    val blockLength =
                                        minOf(ANALYSIS_BLOCK_BYTES, pcm.size - offset)
                                    val written =
                                        track.write(
                                            pcm,
                                            offset,
                                            blockLength,
                                            AudioTrack.WRITE_BLOCKING,
                                        )
                                    if (written <= 0) break
                                    lipSyncAnalyzer.consume(pcm, offset, written)
                                        .lastOrNull()
                                        ?.let(onLipSync)
                                    offset += written
                                }
                            }
                        } catch (error: Throwable) {
                            if (!cancelled.get()) failure = error
                        } finally {
                            onLipSync(lipSyncAnalyzer.reset())
                            runCatching { track.stop() }
                            runCatching { track.flush() }
                            track.release()
                            audioTrack = null
                            playerDone.countDown()
                        }
                    },
                    "fish-audio-player",
                ).apply {
                    isDaemon = true
                    start()
                }
        }

    }

    class FishRealtimeException(message: String) : Exception(message)

    companion object {
        private const val ANALYSIS_BLOCK_BYTES = 2_048
        private const val LIVE_URL = "wss://api.fish.audio/v1/tts/live"
        private val END_OF_AUDIO = ByteArray(0)
        private val HTTP_CLIENT =
            OkHttpClient.Builder()
                .connectTimeout(20, TimeUnit.SECONDS)
                .readTimeout(0, TimeUnit.MILLISECONDS)
                .pingInterval(20, TimeUnit.SECONDS)
                .build()
    }
}
