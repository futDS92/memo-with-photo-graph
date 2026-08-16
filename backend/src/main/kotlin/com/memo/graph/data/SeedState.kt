package com.memo.graph.data

import java.net.URLEncoder
import java.nio.charset.Charset
import java.time.Instant

fun seedAppState(): AppState {
    val words = listOf(
        Word(
            id = "word-orchard",
            term = "orchard",
            pos = "noun",
            definition = "과수원, 특히 사과나 배 같은 과일나무가 자라는 장소",
            example = "We walked through the orchard in spring.",
            memo = "fruit / trees / garden 이미지를 같이 기억",
            tags = listOf("nature", "food", "place"),
            photo = createSeedPhoto("orchard", "#425f56", "#c7a06f"),
        ),
        Word(
            id = "word-grove",
            term = "grove",
            pos = "noun",
            definition = "작은 나무숲, 나무가 일정하게 모여 있는 곳",
            example = "A grove of olive trees stood behind the house.",
            memo = "orchard보다 더 자연적이고 작은 숲 느낌",
            tags = listOf("nature", "landscape"),
            photo = createSeedPhoto("grove", "#2e5b4e", "#8bb49a"),
        ),
        Word(
            id = "word-tree",
            term = "tree",
            pos = "noun",
            definition = "나무, 줄기와 가지를 가진 식물",
            example = "The tree casts a long shadow.",
            memo = "상위 개념: orchard와 grove 모두 tree와 연결",
            tags = listOf("nature", "base"),
            photo = createSeedPhoto("tree", "#45574d", "#b48d5e"),
        ),
        Word(
            id = "word-farm",
            term = "farm",
            pos = "noun",
            definition = "농장, 농작물이나 가축을 기르는 곳",
            example = "The farm grows apples and pears.",
            memo = "orchard가 farm의 하위 공간으로 느껴질 때 연결",
            tags = listOf("food", "place"),
            photo = createSeedPhoto("farm", "#5b6f53", "#d1a975"),
        ),
        Word(
            id = "word-bloom",
            term = "bloom",
            pos = "verb",
            definition = "꽃이 피다, 번성하다",
            example = "The trees bloom in April.",
            memo = "사진과 연결하면 계절 기억이 잘 붙음",
            tags = listOf("verb", "season"),
            photo = createSeedPhoto("bloom", "#734f5c", "#d7a58a"),
        ),
    )

    val relations = listOf(
        Relation("rel-1", "word-orchard", "word-tree", RelationType.HYPONYM, "contains"),
        Relation("rel-2", "word-grove", "word-tree", RelationType.HYPONYM, "made of"),
        Relation("rel-3", "word-orchard", "word-farm", RelationType.PART_OF, "can belong to"),
        Relation("rel-4", "word-orchard", "word-bloom", RelationType.RELATED, "seasonal image"),
        Relation("rel-5", "word-grove", "word-bloom", RelationType.RELATED, "forest feeling"),
    )

    return AppState(
        words = words,
        relations = relations,
        updatedAt = Instant.now().toString(),
    )
}

private fun createSeedPhoto(label: String, colorA: String, colorB: String): String {
    val svg =
        """
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
          <defs>
            <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="$colorA" />
              <stop offset="100%" stop-color="$colorB" />
            </linearGradient>
            <linearGradient id="w" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#ffffff" stop-opacity=".18"/>
              <stop offset="100%" stop-color="#000000" stop-opacity=".08"/>
            </linearGradient>
          </defs>
          <rect width="480" height="320" fill="url(#g)" />
          <rect width="480" height="320" fill="url(#w)" />
          <circle cx="132" cy="110" r="74" fill="#ffffff" fill-opacity=".14"/>
          <circle cx="332" cy="178" r="98" fill="#ffffff" fill-opacity=".08"/>
          <text x="36" y="274" fill="#ffffff" fill-opacity=".88" font-family="Inter, Arial, sans-serif" font-size="46" font-weight="800">$label</text>
        </svg>
        """.trimIndent()

    return "data:image/svg+xml;charset=UTF-8,${URLEncoder.encode(svg, Charset.forName("UTF-8"))}"
}
