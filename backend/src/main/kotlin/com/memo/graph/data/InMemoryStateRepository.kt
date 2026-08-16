package com.memo.graph.data

import java.time.Instant
import java.util.concurrent.atomic.AtomicReference

class InMemoryStateRepository private constructor(initialState: AppState) : StateRepository {
    private val state = AtomicReference(initialState)

    override fun getState(): AppState = state.get()

    override fun replaceState(state: AppState): AppState {
        val next = state.copy(updatedAt = Instant.now().toString())
        this.state.set(next)
        return next
    }

    companion object {
        fun withSeedData(): InMemoryStateRepository = InMemoryStateRepository(seedAppState())
    }
}
