package com.memo.graph.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.SerialName

@Serializable
data class Word(
    val id: String,
    val term: String,
    val pos: String? = null,
    val definition: String,
    val example: String? = null,
    val memo: String? = null,
    val tags: List<String> = emptyList(),
    val photo: String? = null,
)

@Serializable
data class Relation(
    val id: String,
    val fromWordId: String,
    val toWordId: String,
    val type: RelationType,
    val label: String? = null,
)

@Serializable
enum class RelationType {
    @SerialName("hypernym")
    HYPERNYM,

    @SerialName("hyponym")
    HYPONYM,

    @SerialName("part_of")
    PART_OF,

    @SerialName("has_part")
    HAS_PART,

    @SerialName("synonym")
    SYNONYM,

    @SerialName("antonym")
    ANTONYM,

    @SerialName("related")
    RELATED,

    @SerialName("example")
    EXAMPLE,
}

@Serializable
data class AppState(
    val words: List<Word> = emptyList(),
    val relations: List<Relation> = emptyList(),
    val updatedAt: String = "",
)
