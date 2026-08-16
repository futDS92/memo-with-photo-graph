package com.memo.graph.data

import kotlinx.serialization.json.Json
import java.io.IOException
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.time.Instant
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

class FileStateRepository private constructor(
    private val statePath: Path,
    private val json: Json,
    initialState: AppState,
) : StateRepository {
    private val lock = ReentrantLock()
    @Volatile
    private var state: AppState = initialState

    override fun getState(): AppState = lock.withLock { state }

    override fun replaceState(state: AppState): AppState {
        val next = state.copy(updatedAt = Instant.now().toString())
        lock.withLock {
            this.state = next
            writeState(next)
        }
        return next
    }

    private fun writeState(next: AppState) {
        statePath.parent?.let { Files.createDirectories(it) }
        val tempPath = statePath.resolveSibling("${statePath.fileName}.tmp")
        val payload = json.encodeToString(AppState.serializer(), next)
        Files.writeString(tempPath, payload, StandardCharsets.UTF_8)
        try {
            Files.move(
                tempPath,
                statePath,
                java.nio.file.StandardCopyOption.REPLACE_EXISTING,
                java.nio.file.StandardCopyOption.ATOMIC_MOVE,
            )
        } catch (_: IOException) {
            Files.move(tempPath, statePath, java.nio.file.StandardCopyOption.REPLACE_EXISTING)
        }
    }

    companion object {
        fun create(
            statePath: Path,
            json: Json,
        ): FileStateRepository {
            val initialState = readState(statePath, json) ?: seedAppState()
            return FileStateRepository(statePath, json, initialState)
        }

        private fun readState(statePath: Path, json: Json): AppState? {
            return try {
                if (!Files.exists(statePath)) return null
                val raw = Files.readString(statePath, StandardCharsets.UTF_8)
                if (raw.isBlank()) return null
                json.decodeFromString(AppState.serializer(), raw)
            } catch (_: Exception) {
                null
            }
        }
    }
}
