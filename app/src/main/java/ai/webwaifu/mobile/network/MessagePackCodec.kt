package ai.webwaifu.mobile.network

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream

internal object MessagePackCodec {
    fun encode(value: Any?): ByteArray {
        val buffer = ByteArrayOutputStream()
        DataOutputStream(buffer).use { writeValue(it, value) }
        return buffer.toByteArray()
    }

    fun decode(bytes: ByteArray): Any? =
        DataInputStream(ByteArrayInputStream(bytes)).use { readValue(it) }

    private fun writeValue(output: DataOutputStream, value: Any?) {
        when (value) {
            null -> output.writeByte(0xc0)
            is Boolean -> output.writeByte(if (value) 0xc3 else 0xc2)
            is String -> writeString(output, value)
            is ByteArray -> writeBinary(output, value)
            is Int -> writeLong(output, value.toLong())
            is Long -> writeLong(output, value)
            is Float -> {
                output.writeByte(0xca)
                output.writeFloat(value)
            }
            is Double -> {
                output.writeByte(0xcb)
                output.writeDouble(value)
            }
            is Map<*, *> -> {
                writeMapHeader(output, value.size)
                value.forEach { (key, item) ->
                    writeString(output, key.toString())
                    writeValue(output, item)
                }
            }
            is Iterable<*> -> {
                val items = value.toList()
                writeArrayHeader(output, items.size)
                items.forEach { writeValue(output, it) }
            }
            else -> error("Unsupported MessagePack value: ${value::class.java.name}")
        }
    }

    private fun writeString(output: DataOutputStream, value: String) {
        val bytes = value.toByteArray(Charsets.UTF_8)
        when {
            bytes.size <= 31 -> output.writeByte(0xa0 or bytes.size)
            bytes.size <= 0xff -> {
                output.writeByte(0xd9)
                output.writeByte(bytes.size)
            }
            bytes.size <= 0xffff -> {
                output.writeByte(0xda)
                output.writeShort(bytes.size)
            }
            else -> {
                output.writeByte(0xdb)
                output.writeInt(bytes.size)
            }
        }
        output.write(bytes)
    }

    private fun writeBinary(output: DataOutputStream, value: ByteArray) {
        when {
            value.size <= 0xff -> {
                output.writeByte(0xc4)
                output.writeByte(value.size)
            }
            value.size <= 0xffff -> {
                output.writeByte(0xc5)
                output.writeShort(value.size)
            }
            else -> {
                output.writeByte(0xc6)
                output.writeInt(value.size)
            }
        }
        output.write(value)
    }

    private fun writeLong(output: DataOutputStream, value: Long) {
        when {
            value in 0..127 -> output.writeByte(value.toInt())
            value in -32..-1 -> output.writeByte(value.toInt())
            value in 0..0xff -> {
                output.writeByte(0xcc)
                output.writeByte(value.toInt())
            }
            value in 0..0xffff -> {
                output.writeByte(0xcd)
                output.writeShort(value.toInt())
            }
            value in Int.MIN_VALUE..Int.MAX_VALUE -> {
                output.writeByte(0xd2)
                output.writeInt(value.toInt())
            }
            else -> {
                output.writeByte(0xd3)
                output.writeLong(value)
            }
        }
    }

    private fun writeMapHeader(output: DataOutputStream, size: Int) {
        when {
            size <= 15 -> output.writeByte(0x80 or size)
            size <= 0xffff -> {
                output.writeByte(0xde)
                output.writeShort(size)
            }
            else -> {
                output.writeByte(0xdf)
                output.writeInt(size)
            }
        }
    }

    private fun writeArrayHeader(output: DataOutputStream, size: Int) {
        when {
            size <= 15 -> output.writeByte(0x90 or size)
            size <= 0xffff -> {
                output.writeByte(0xdc)
                output.writeShort(size)
            }
            else -> {
                output.writeByte(0xdd)
                output.writeInt(size)
            }
        }
    }

    private fun readValue(input: DataInputStream): Any? {
        val marker = input.readUnsignedByte()
        return when {
            marker <= 0x7f -> marker.toLong()
            marker in 0x80..0x8f -> readMap(input, marker and 0x0f)
            marker in 0x90..0x9f -> readArray(input, marker and 0x0f)
            marker in 0xa0..0xbf -> readString(input, marker and 0x1f)
            marker >= 0xe0 -> (marker - 256).toLong()
            else ->
                when (marker) {
                    0xc0 -> null
                    0xc2 -> false
                    0xc3 -> true
                    0xc4 -> readBytes(input, input.readUnsignedByte())
                    0xc5 -> readBytes(input, input.readUnsignedShort())
                    0xc6 -> readBytes(input, input.readInt())
                    0xca -> input.readFloat()
                    0xcb -> input.readDouble()
                    0xcc -> input.readUnsignedByte().toLong()
                    0xcd -> input.readUnsignedShort().toLong()
                    0xce -> input.readInt().toLong() and 0xffffffffL
                    0xcf -> input.readLong()
                    0xd0 -> input.readByte().toLong()
                    0xd1 -> input.readShort().toLong()
                    0xd2 -> input.readInt().toLong()
                    0xd3 -> input.readLong()
                    0xd9 -> readString(input, input.readUnsignedByte())
                    0xda -> readString(input, input.readUnsignedShort())
                    0xdb -> readString(input, input.readInt())
                    0xdc -> readArray(input, input.readUnsignedShort())
                    0xdd -> readArray(input, input.readInt())
                    0xde -> readMap(input, input.readUnsignedShort())
                    0xdf -> readMap(input, input.readInt())
                    else -> error("Unsupported MessagePack marker: 0x${marker.toString(16)}")
                }
        }
    }

    private fun readMap(input: DataInputStream, size: Int): Map<String, Any?> =
        buildMap(size) {
            repeat(size) {
                val key = readValue(input)?.toString().orEmpty()
                put(key, readValue(input))
            }
        }

    private fun readArray(input: DataInputStream, size: Int): List<Any?> =
        List(size) { readValue(input) }

    private fun readString(input: DataInputStream, size: Int): String =
        String(readBytes(input, size), Charsets.UTF_8)

    private fun readBytes(input: DataInputStream, size: Int): ByteArray {
        require(size >= 0) { "Invalid MessagePack length." }
        return ByteArray(size).also { input.readFully(it) }
    }
}
