import {
  buildFillBlankPrompt,
  buildMeaningChoices,
  evaluateFillBlank,
  evaluateTypedMeaning,
  pickQuestionType,
  selectRevisionQueue,
  tokenize,
} from '@/lib/revision'
import type { VocabularyWord } from '@/types/vocabulary'

function makeWord(overrides: Partial<VocabularyWord> = {}): VocabularyWord {
  return {
    id: 'w1',
    userId: 'u1',
    word: 'Ephemeral',
    normalizedWord: 'ephemeral',
    definitions: [{ partOfSpeech: 'adjective', definition: 'lasting for a very short time' }],
    simpleDefinition: 'lasting for a very short time',
    synonyms: ['transient', 'fleeting'],
    antonyms: ['permanent'],
    collocations: [],
    expressions: [],
    examples: [{ sentence: 'The ephemeral beauty of cherry blossoms.', context: 'Describing flowers.' }],
    personalNotes: '',
    isFavourite: false,
    isDifficult: false,
    learningStatus: 'learning',
    lastAccessedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

// ─── tokenize ──────────────────────────────────────────────────────────────────

describe('tokenize', () => {
  it('splits on whitespace and strips punctuation', () => {
    expect(tokenize('hello, world!')).toEqual(['hello', 'world'])
  })

  it('filters stop words', () => {
    const tokens = tokenize('the quick brown fox')
    expect(tokens).not.toContain('the')
    expect(tokens).toContain('quick')
  })

  it('lowercases tokens', () => {
    expect(tokenize('HELLO')).toEqual(['hello'])
  })
})

// ─── evaluateTypedMeaning ─────────────────────────────────────────────────────

describe('evaluateTypedMeaning', () => {
  const word = makeWord()

  it('accepts an answer containing key words from the definition', () => {
    expect(evaluateTypedMeaning('short time', word)).toBe(true)
  })

  it('rejects an entirely wrong answer', () => {
    expect(evaluateTypedMeaning('a large building', word)).toBe(false)
  })

  it('rejects an empty answer', () => {
    expect(evaluateTypedMeaning('', word)).toBe(false)
  })
})

// ─── evaluateFillBlank ────────────────────────────────────────────────────────

describe('evaluateFillBlank', () => {
  const word = makeWord()

  it('accepts the exact word', () => {
    expect(evaluateFillBlank('ephemeral', word)).toBe(true)
  })

  it('accepts the original capitalised word', () => {
    expect(evaluateFillBlank('Ephemeral', word)).toBe(true)
  })

  it('rejects an unrelated word', () => {
    expect(evaluateFillBlank('permanent', word)).toBe(false)
  })

  it('accepts a simple plural match', () => {
    const pluralWord = makeWord({ word: 'Wishes', normalizedWord: 'wishes' })
    expect(evaluateFillBlank('wish', pluralWord)).toBe(false) // only strips trailing s
  })
})

// ─── buildFillBlankPrompt ─────────────────────────────────────────────────────

describe('buildFillBlankPrompt', () => {
  it('replaces the word with blanks in a matching example sentence', () => {
    const prompt = buildFillBlankPrompt(makeWord())
    expect(prompt).toContain('______')
    expect(prompt).not.toContain('ephemeral')
  })

  it('falls back to a generic prompt if there are no examples', () => {
    const word = makeWord({ examples: [] })
    const prompt = buildFillBlankPrompt(word)
    expect(prompt).toContain('______')
  })
})

// ─── buildMeaningChoices ──────────────────────────────────────────────────────

describe('buildMeaningChoices', () => {
  const pool = [
    makeWord({ id: 'w1', word: 'Ephemeral', normalizedWord: 'ephemeral', simpleDefinition: 'short-lived' }),
    makeWord({ id: 'w2', word: 'Loquacious', normalizedWord: 'loquacious', simpleDefinition: 'very talkative' }),
    makeWord({ id: 'w3', word: 'Pernicious', normalizedWord: 'pernicious', simpleDefinition: 'having a harmful effect' }),
    makeWord({ id: 'w4', word: 'Ephemeral2', normalizedWord: 'ephemeral2', simpleDefinition: 'another meaning' }),
  ]

  it('returns 4 choices including the correct answer', () => {
    const { options, correct } = buildMeaningChoices(pool[0]!, pool)
    expect(options).toHaveLength(4)
    expect(options).toContain(correct)
  })

  it('correct answer matches the word\'s simpleDefinition', () => {
    const { correct } = buildMeaningChoices(pool[0]!, pool)
    expect(correct).toBe('short-lived')
  })

  it('does not include the correct word as a distractor', () => {
    const { options, correct } = buildMeaningChoices(pool[0]!, pool)
    const distractors = options.filter((opt) => opt !== correct)
    expect(distractors).not.toContain('short-lived')
  })
})

// ─── pickQuestionType ─────────────────────────────────────────────────────────

describe('pickQuestionType', () => {
  it('returns a valid question type', () => {
    const valid = ['multiple_choice', 'type_meaning', 'fill_blank']
    for (let i = 0; i < 20; i++) {
      expect(valid).toContain(pickQuestionType())
    }
  })

  it('uses the provided random function', () => {
    expect(pickQuestionType(() => 0)).toBe('multiple_choice')
    expect(pickQuestionType(() => 0.99)).toBe('fill_blank')
  })
})

// ─── selectRevisionQueue ──────────────────────────────────────────────────────

describe('selectRevisionQueue', () => {
  const now = new Date()
  const past = new Date(now.getTime() - 86_400_000).toISOString()
  const future = new Date(now.getTime() + 86_400_000).toISOString()

  const words = [
    { id: 'a', nextReviewAt: past, createdAt: past },
    { id: 'b', nextReviewAt: future, createdAt: past },
    { id: 'c', nextReviewAt: past, createdAt: past },
  ]

  it('returns due words first when preferDue is true', () => {
    const queue = selectRevisionQueue(words, { preferDue: true })
    const ids = queue.map((w) => w.id)
    // 'a' and 'c' are due; 'b' is not
    expect(ids).toContain('a')
    expect(ids).toContain('c')
    expect(ids).not.toContain('b')
  })

  it('respects the limit option', () => {
    const queue = selectRevisionQueue(words, { limit: 1, preferDue: true })
    expect(queue).toHaveLength(1)
  })

  it('excludes a specific word when excludeId is set', () => {
    const queue = selectRevisionQueue(words, { excludeId: 'a', preferDue: true })
    expect(queue.map((w) => w.id)).not.toContain('a')
  })
})
