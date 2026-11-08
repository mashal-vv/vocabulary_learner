import type { QuestionType, VocabularyWord } from '@/types/vocabulary'

const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'to',
  'of',
  'in',
  'on',
  'for',
  'with',
  'is',
  'are',
  'was',
  'were',
  'be',
  'as',
])

export function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
}

export function evaluateTypedMeaning(answer: string, word: VocabularyWord) {
  const expected = tokenize(
    [word.simpleDefinition, ...word.definitions.map((item) => item.definition)].join(' '),
  )
  const actual = tokenize(answer)
  if (actual.length === 0 || expected.length === 0) return false
  const expectedSet = new Set(expected)
  const overlap = actual.filter((token) => expectedSet.has(token)).length
  return overlap / Math.max(actual.length, 1) >= 0.34 && overlap >= 1
}

export function evaluateFillBlank(answer: string, word: VocabularyWord) {
  const normalized = answer.trim().toLowerCase()
  return (
    normalized === word.normalizedWord ||
    normalized === word.word.trim().toLowerCase() ||
    normalized.replace(/s$/, '') === word.normalizedWord.replace(/s$/, '')
  )
}

export function pickQuestionType(random = Math.random): QuestionType {
  const types: QuestionType[] = ['multiple_choice', 'type_meaning', 'fill_blank']
  return types[Math.floor(random() * types.length)] ?? 'multiple_choice'
}

export function buildFillBlankPrompt(word: VocabularyWord) {
  const sentence =
    word.examples.find((item) => item.sentence.toLowerCase().includes(word.normalizedWord))
      ?.sentence ?? word.examples[0]?.sentence
  if (!sentence) {
    return `Write the missing word: a ______ that means “${word.simpleDefinition ?? word.definitions[0]?.definition ?? 'this idea'}”.`
  }
  const pattern = new RegExp(word.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig')
  if (pattern.test(sentence)) {
    return sentence.replace(pattern, '______')
  }
  return sentence.replace(new RegExp(word.normalizedWord, 'ig'), '______')
}

export function buildMeaningChoices(
  word: VocabularyWord,
  pool: VocabularyWord[],
  random = Math.random,
) {
  const correct =
    word.simpleDefinition ?? word.definitions[0]?.definition ?? 'No definition saved yet.'
  const distractors = pool
    .filter((item) => item.id !== word.id)
    .map((item) => item.simpleDefinition ?? item.definitions[0]?.definition)
    .filter((item): item is string => Boolean(item && item !== correct))
  const unique = Array.from(new Set(distractors))
  const selected: string[] = []
  while (selected.length < 3 && unique.length > 0) {
    const index = Math.floor(random() * unique.length)
    const [choice] = unique.splice(index, 1)
    if (choice) selected.push(choice)
  }
  while (selected.length < 3) {
    selected.push(`A different meaning from “${word.word}”.`)
  }
  const options = [correct, ...selected.slice(0, 3)]
  for (let i = options.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const current = options[i]
    const swap = options[j]
    if (current === undefined || swap === undefined) continue
    options[i] = swap
    options[j] = current
  }
  return { options, correct }
}

export function selectRevisionQueue<T extends { id: string; nextReviewAt?: string; createdAt?: string }>(
  words: T[],
  options: { excludeId?: string; limit?: number; preferDue?: boolean },
) {
  const now = Date.now()
  const filtered = words.filter((word) => word.id !== options.excludeId)
  const due = filtered.filter((word) => {
    if (!word.nextReviewAt) return true
    return new Date(word.nextReviewAt).getTime() <= now
  })
  const source = options.preferDue !== false && due.length > 0 ? due : filtered
  const sorted = [...source].sort((a, b) => {
    const aDue = a.nextReviewAt ? new Date(a.nextReviewAt).getTime() : 0
    const bDue = b.nextReviewAt ? new Date(b.nextReviewAt).getTime() : 0
    return aDue - bDue
  })
  return sorted.slice(0, options.limit ?? sorted.length)
}
