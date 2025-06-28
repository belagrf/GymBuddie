import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

// Definiert einen einzelnen Satz
export interface SetEntry {
  id: string
  weight: number
  reps: number
}

// Definiert eine Trainingseinheit für einen Tag, die mehrere Sätze enthält
export interface WorkoutSession {
  date: string
  sets: SetEntry[]
}

// Exercise enthält jetzt eine Historie von WorkoutSessions
export interface Exercise {
  id: string
  name: string
  videoUrl?: string
  history: WorkoutSession[]
}

export interface Category {
  id: string
  name: string
  exercises: Exercise[]
}

export const useGymStore = defineStore('gym', () => {
  const categories = ref<Category[]>(JSON.parse(localStorage.getItem('gymData') || '[]'))

  // --- ACTIONS ---

  function logSet(exerciseId: string, newSet: Omit<SetEntry, 'id'>) {
    for (const category of categories.value) {
      const exercise = category.exercises.find((e) => e.id === exerciseId)
      if (exercise) {
        const today = new Date().toISOString().split('T')[0]

        const todaySession = exercise.history.find((session) => session.date === today)

        const setToAdd: SetEntry = { ...newSet, id: Date.now().toString() }

        if (todaySession) {
          todaySession.sets.unshift(setToAdd)
        } else {
          exercise.history.unshift({
            date: today,
            sets: [setToAdd],
          })
        }
        break
      }
    }
  }

  function addCategory(name: string) {
    if (!name.trim()) return
    categories.value.unshift({
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

  // --- PERSISTENCE ---
  watch(
    categories,
    (newData) => {
      localStorage.setItem('gymData', JSON.stringify(newData))
    },
    { deep: true },
  )

  return {
    categories,
    addCategory,
    deleteCategory,
    addExercise,
    deleteExercise,
    logSet,
  }
})
