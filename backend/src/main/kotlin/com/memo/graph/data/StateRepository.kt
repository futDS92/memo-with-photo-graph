package com.memo.graph.data

interface StateRepository {
    fun getState(): AppState

    fun replaceState(state: AppState): AppState
}

