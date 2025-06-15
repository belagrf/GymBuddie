import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

// Datenstrukturen bleiben gleich
export interface ProgressEntry {
  date: string
  weight: number
  reps: number
  sets: number
}

export interface Exercise {
  id: string
  name: string
  videoUrl?: string
  history: ProgressEntry[]
}

export interface Category {
  id: string
  name: string
  exercises: Exercise[]
}

export const useGymStore = defineStore('gym', () => {
  // === STATE ===
  const categories = ref<Category[]>(JSON.parse(localStorage.getItem('gymData') || '[]'))

  // === ACTIONS ===

  function addCategory(name: string) {
    if (!name.trim()) return
    categories.value.unshift({
      // unshift statt push, damit neue Einträge oben erscheinen
      id: Date.now().toString(),
      name: name.trim(),
      exercises: [],
    })
  }

  function deleteCategory(categoryId: string) {
    categories.value = categories.value.filter((c) => c.id !== categoryId)
  }

  function addExercise(categoryId: string, exerciseName: string, videoUrl?: string) {
    const category = categories.value.find((c) => c.id === categoryId)
    if (!category || !exerciseName.trim()) return

    category.exercises.unshift({
      // unshift statt push
      id: Date.now().toString(),
      name: exerciseName.trim(),
      videoUrl: videoUrl?.trim(),
      history: [],
    })
  }

  function deleteExercise(categoryId: string, exerciseId: string) {
    const category = categories.value.find((c) => c.id === categoryId)
    if (category) {
      category.exercises = category.exercises.filter((e) => e.id !== exerciseId)
    }
  }

  function logProgress(exerciseId: string, progress: Omit<ProgressEntry, 'date'>) {
    for (const category of categories.value) {
      const exercise = category.exercises.find((e) => e.id === exerciseId)
      if (exercise) {
        exercise.history.unshift({
          // unshift statt push
          ...progress,
          date: new Date().toISOString().split('T')[0],
        })
        break
      }
    }
  }

  // === PERSISTENCE ===
  watch(
    categories,
    (newData) => {
      localStorage.setItem('gymData', JSON.stringify(newData))
    },
    { deep: true },
  )

  // Gib alles zurück, was die Komponenten brauchen
  return {
    categories,
    addCategory,
    deleteCategory,
    addExercise,
    deleteExercise,
    logProgress,
  }
})
