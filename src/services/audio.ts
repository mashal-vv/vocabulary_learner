export function playPronunciation(options: { audioUrl?: string; word: string }) {
  if (options.audioUrl) {
    const audio = new Audio(options.audioUrl)
    void audio.play()
    return
  }
  const Speech = window.speechSynthesis
  if (!Speech) return
  const utterance = new SpeechSynthesisUtterance(options.word)
  const british = Speech.getVoices().find((voice) => /en-GB|UK|British/i.test(`${voice.lang} ${voice.name}`))
  if (british) utterance.voice = british
  utterance.lang = 'en-GB'
  Speech.speak(utterance)
}
