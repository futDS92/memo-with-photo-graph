package com.memo.graph

import com.memo.graph.data.FileStateRepository
import com.memo.graph.data.InMemoryStateRepository
import com.memo.graph.http.registerRoutes
import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import io.ktor.server.plugins.cors.routing.CORS
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json
import java.nio.file.Paths

fun main() {
    embeddedServer(
        Netty,
        port = System.getenv("PORT")?.toIntOrNull() ?: 8080,
        host = System.getenv("HOST") ?: "0.0.0.0",
        module = Application::module,
    ).start(wait = true)
}

fun Application.module() {
    install(CORS) {
        anyHost()
        allowHeader(io.ktor.http.HttpHeaders.ContentType)
        allowHeader(io.ktor.http.HttpHeaders.Accept)
        allowMethod(io.ktor.http.HttpMethod.Get)
        allowMethod(io.ktor.http.HttpMethod.Post)
        allowMethod(io.ktor.http.HttpMethod.Put)
        allowMethod(io.ktor.http.HttpMethod.Options)
    }
    install(ContentNegotiation) {
        json(
            Json {
                prettyPrint = true
                ignoreUnknownKeys = true
                encodeDefaults = true
            },
        )
    }

    val repository = createStateRepository()
    registerRoutes(repository)
}

private fun createStateRepository(): com.memo.graph.data.StateRepository {
    val storage = System.getenv("STATE_STORAGE")?.lowercase() ?: "file"
    return if (storage == "memory") {
        InMemoryStateRepository.withSeedData()
    } else {
        val statePath = Paths.get(
            System.getenv("STATE_FILE") ?: "data/state.json",
        )
        FileStateRepository.create(statePath, Json {
            prettyPrint = true
            ignoreUnknownKeys = true
            encodeDefaults = true
        })
    }
}
