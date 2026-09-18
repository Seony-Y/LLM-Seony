export interface Note {
  id: string
  body: string
  updatedAt: string
}

const storageKey = 'personal-assistant.notes'

export const noteRepository = {
  list(): Note[] {
    const stored = localStorage.getItem(storageKey)
    return stored ? (JSON.parse(stored) as Note[]) : []
  },
  save(notes: Note[]) {
    localStorage.setItem(storageKey, JSON.stringify(notes))
  },
}