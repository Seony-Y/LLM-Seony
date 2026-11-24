const PARTICLES =
  /(?:에서는|이랑은|한테서|에게서|으로는|에서|에게|한테|까지|부터|이랑|으로|하고|처럼|보다|라고|은|는|이|가|을|를|에|의|와|과|랑|도|만|로|께)$/
const ASKING = /^(?:뭐|뭘|뭔|무엇|무슨|어디|언제|누구|누가|얼마|몇|어떻게|왜|어느|어떤|혹시)/
const ENDING = /(?:이었|였|했|하|었|았|겠)?(?:지|죠|더라|던가|나|니|까|야|어|아|어요|아요|예요|이에요|해|줘|줄래)$/
const REQUEST = /^(?:알려|찾아|보여|말해|기억)/

/** 조사를 떼되 두 글자는 남긴다. "민수와"는 "민수", "지은"은 그대로. */
function stripParticle(word: string) {
  const stem = word.replace(PARTICLES, '')
  return stem.length >= 2 ? stem : word
}

export function words(text: string): string[] {
  const found = text
    .toLowerCase()
    .split(/[^0-9a-z가-힣]+/)
    .filter(Boolean)
    .map(stripParticle)
  return [...new Set(found)]
}

/** 물음에서 찾을 낱말만 남긴다. "주차 어디 했지?"는 ["주차"]. */
export function askedWords(question: string): string[] {
  const tokens = question
    .toLowerCase()
    .split(/[^0-9a-z가-힣]+/)
    .filter((token) => token && !ASKING.test(token) && !REQUEST.test(token))
  const last = tokens.at(-1)
  if (last && ENDING.test(last)) {
    const stem = last.replace(ENDING, '')
    if (stem.length >= 2) tokens[tokens.length - 1] = stem
    else if (tokens.length > 1 || stem.length < 2) tokens.pop()
  }
  return [...new Set(tokens.map(stripParticle))]
}
