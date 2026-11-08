import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useVault } from '@/hooks/useVault'
import {
  createCollection,
  defaultSettings,
  deleteWord,
  listCollections,
  listHistory,
  listProgress,
  listWords,
  updateSettings,
  updateWord,
} from '@/services/vocabulary/repository'
import { migrateLocalDataToCloud, synchronise } from '@/services/sync/syncEngine'

export function useLibrary() {
  const { userId } = useVault()
  const queryClient = useQueryClient()
  const migrationRan = useRef(false)

  // On first unlock: migrate any local-only data to Supabase, then sync
  useEffect(() => {
    if (!userId || migrationRan.current) return
    migrationRan.current = true
    void migrateLocalDataToCloud(userId).then(() => synchronise()).then(() => {
      void queryClient.invalidateQueries()
    })
  }, [userId, queryClient])

  const wordsQuery = useQuery({
    queryKey: ['words', userId],
    enabled: Boolean(userId),
    queryFn: () => listWords(userId!),
  })
  const progressQuery = useQuery({
    queryKey: ['progress', userId],
    enabled: Boolean(userId),
    queryFn: () => listProgress(userId!),
  })
  const historyQuery = useQuery({
    queryKey: ['history', userId],
    enabled: Boolean(userId),
    queryFn: () => listHistory(userId!),
  })
  const collectionsQuery = useQuery({
    queryKey: ['collections', userId],
    enabled: Boolean(userId),
    queryFn: () => listCollections(userId!),
  })
  const settingsQuery = useQuery({
    queryKey: ['settings', userId],
    enabled: Boolean(userId),
    queryFn: () => defaultSettings(userId!),
  })

  const invalidate = async () => {
    await queryClient.invalidateQueries()
    void synchronise()
  }

  const favourite = useMutation({
    mutationFn: (wordId: string) => {
      const word = wordsQuery.data?.find((item) => item.id === wordId)
      return updateWord(wordId, { isFavourite: !word?.isFavourite })
    },
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: deleteWord,
    onSuccess: invalidate,
  })

  const notes = useMutation({
    mutationFn: ({ wordId, personalNotes }: { wordId: string; personalNotes: string }) =>
      updateWord(wordId, { personalNotes }),
    onSuccess: invalidate,
  })

  const addCollection = useMutation({
    mutationFn: (name: string) => createCollection(userId!, name),
    onSuccess: invalidate,
  })

  const saveSettings = useMutation({
    mutationFn: (patch: Parameters<typeof updateSettings>[1]) => updateSettings(userId!, patch),
    onSuccess: invalidate,
  })

  return {
    userId,
    words: wordsQuery.data ?? [],
    progress: progressQuery.data ?? [],
    history: historyQuery.data ?? [],
    collections: collectionsQuery.data ?? [],
    settings: settingsQuery.data,
    isLoading: wordsQuery.isLoading,
    favourite,
    remove,
    notes,
    addCollection,
    saveSettings,
    invalidate,
  }
}
