import { downloadTextFile } from '@/composables/download'
import { toLocalDateKey, useGymStore } from '@/stores/gymStore'

export type ShareOutcome = 'shared' | 'cancelled' | 'unavailable' | 'failed'

function backupFileName() {
  return `gymbuddie-backup-${toLocalDateKey()}.json`
}

/** Whether this browser can hand a file to the system share sheet (iOS/Android, some desktops). */
function detectFileSharing(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') return false
  try {
    const probe = new File(['{}'], 'probe.json', { type: 'application/json' })
    return navigator.canShare({ files: [probe] })
  } catch {
    return false
  }
}

/**
 * Exports a backup either through the share sheet, so it can go straight to iCloud, Drive, mail
 * or a chat, or as a downloaded file. Both record the export for the backup reminder.
 */
export function useBackupExport() {
  const gymStore = useGymStore()
  const canShareFiles = detectFileSharing()

  async function shareBackup(): Promise<ShareOutcome> {
    if (!canShareFiles) return 'unavailable'
    const file = new File([gymStore.exportData()], backupFileName(), { type: 'application/json' })
    try {
      await navigator.share({ files: [file], title: 'GymBuddie-Backup' })
    } catch (error) {
      return error instanceof DOMException && error.name === 'AbortError' ? 'cancelled' : 'failed'
    }
    gymStore.markExported()
    return 'shared'
  }

  function downloadBackup(): boolean {
    try {
      downloadTextFile(backupFileName(), gymStore.exportData())
    } catch {
      return false
    }
    gymStore.markExported()
    return true
  }

  return { canShareFiles, shareBackup, downloadBackup }
}
