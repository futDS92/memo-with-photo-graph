package com.memo.graph.http

import com.memo.graph.data.AppState
import com.memo.graph.data.StateRepository
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import io.ktor.server.routing.routing

fun io.ktor.server.application.Application.registerRoutes(repository: StateRepository) {
    routing {
        get("/api/health") {
            call.respond(mapOf("ok" to true))
        }

        get("/api/state") {
            call.respond(repository.getState())
        }

        put("/api/state") {
            val payload = runCatching { call.receive<AppState>() }.getOrElse {
                call.badRequest("invalid state payload")
                return@put
            }
            call.respond(repository.replaceState(payload))
        }

        post("/api/state") {
            val payload = runCatching { call.receive<AppState>() }.getOrElse {
                call.badRequest("invalid state payload")
                return@post
            }
            call.respond(repository.replaceState(payload))
        }

        get("/") {
            call.respondText("memo with photo graph backend", contentType = io.ktor.http.ContentType.Text.Plain)
        }
    }
}

private suspend fun ApplicationCall.badRequest(message: String) {
    respond(HttpStatusCode.BadRequest, mapOf("error" to message))
}
