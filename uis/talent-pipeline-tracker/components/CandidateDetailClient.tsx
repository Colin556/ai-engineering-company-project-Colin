"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  addCandidateNote,
  deleteCandidateNote,
  getCandidate,
  getCandidateNotes,
  patchCandidate,
} from "@/lib/api";
import { STAGE_ORDER, STATUS_ORDER } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { getStageLabel, getStatusLabel } from "@/lib/labels";
import { CandidateNote, CandidateRecord } from "@/lib/types";

interface CandidateDetailClientProps {
  id: string;
}

export function CandidateDetailClient({ id }: CandidateDetailClientProps) {
  const { locale, t } = useI18n();
  const [record, setRecord] = useState<CandidateRecord | null>(null);
  const [notes, setNotes] = useState<CandidateNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusDraft, setStatusDraft] = useState("");
  const [stageDraft, setStageDraft] = useState("");
  const [isSavingMeta, setIsSavingMeta] = useState(false);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [feedback, setFeedback] = useState("");
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      setError("");
      try {
        const [recordResponse, notesResponse] = await Promise.all([
          getCandidate(id),
          getCandidateNotes(id),
        ]);

        if (!isMounted) {
          return;
        }

        setRecord(recordResponse);
        setStatusDraft(recordResponse.status);
        setStageDraft(recordResponse.stage);
        setNotes(notesResponse.data || []);
      } catch (nextError) {
        if (!isMounted) {
          return;
        }
        setError(nextError instanceof Error ? nextError.message : t.unknownError);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [id, t.unknownError]);

  const canSaveStatus = useMemo(() => {
    if (!record) return false;
    return statusDraft !== record.status || stageDraft !== record.stage;
  }, [record, stageDraft, statusDraft]);

  const onSaveStatusStage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!record || !canSaveStatus) {
      return;
    }

    setIsSavingMeta(true);
    setFeedback("");

    try {
      const updated = await patchCandidate(record.id, {
        status: statusDraft as CandidateRecord["status"],
        stage: stageDraft as CandidateRecord["stage"],
      });
      setRecord(updated);
      setFeedback(t.saveSuccess);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t.unknownError);
    } finally {
      setIsSavingMeta(false);
    }
  };

  const onAddNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!record || !noteDraft.trim()) {
      return;
    }

    setIsAddingNote(true);
    setFeedback("");

    try {
      const created = await addCandidateNote(record.id, noteDraft.trim());
      setNotes((prev) => [created, ...prev]);
      setNoteDraft("");
      setFeedback(t.noteAdded);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t.unknownError);
    } finally {
      setIsAddingNote(false);
    }
  };

  const onDeleteNote = async (noteId: string) => {
    if (!record) {
      return;
    }

    setDeletingNoteId(noteId);
    setFeedback("");
    try {
      await deleteCandidateNote(record.id, noteId);
      setNotes((prev) => prev.filter((note) => note.id !== noteId));
      setFeedback(t.noteDeleted);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t.unknownError);
    } finally {
      setDeletingNoteId(null);
    }
  };

  if (isLoading) {
    return <p className="text-sm text-stone-600">{t.loading}</p>;
  }

  if (error && !record) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <p className="font-semibold">{t.errorTitle}</p>
        <p className="mt-2">{error}</p>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-6 text-sm text-stone-700">
        Candidate not found.
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
      <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-2xl font-semibold text-amber-950">{record.full_name}</h2>
            <p className="mt-1 text-sm text-stone-600">{record.position}</p>
          </div>
          <Link
            href={`/candidates/${record.id}/edit`}
            className="rounded-full border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-700 transition hover:bg-stone-100"
          >
            {t.editData}
          </Link>
        </div>

        <dl className="mt-6 grid gap-4 text-sm md:grid-cols-2">
          <Info label={t.email} value={record.email} />
          <Info label={t.phone} value={record.phone} />
          <Info label={t.appliedAt} value={formatDate(record.applied_at, locale)} />
          <Info label={t.updatedAt} value={formatDate(record.updated_at, locale)} />
          <Info label={t.notesCount} value={String(notes.length)} />
          <Info label={t.status} value={getStatusLabel(locale, record.status)} />
          <Info label={t.stage} value={getStageLabel(locale, record.stage)} />
        </dl>

        <form onSubmit={onSaveStatusStage} className="mt-6 rounded-2xl border border-amber-900/15 bg-amber-50/60 p-4">
          <h3 className="text-sm font-semibold text-amber-950">{t.updateStatusStage}</h3>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-xs font-medium text-stone-700">{t.status}</span>
              <select
                value={statusDraft}
                onChange={(event) => setStatusDraft(event.target.value)}
                className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900"
              >
                {STATUS_ORDER.map((status) => (
                  <option key={status} value={status}>
                    {getStatusLabel(locale, status)}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-medium text-stone-700">{t.stage}</span>
              <select
                value={stageDraft}
                onChange={(event) => setStageDraft(event.target.value)}
                className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900"
              >
                {STAGE_ORDER.map((stage) => (
                  <option key={stage} value={stage}>
                    {getStageLabel(locale, stage)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button
            type="submit"
            disabled={!canSaveStatus || isSavingMeta}
            className="mt-4 rounded-full bg-amber-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSavingMeta ? t.saving : t.saveChanges}
          </button>
        </form>
      </section>

      <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <h3 className="font-serif text-xl font-semibold text-amber-950">{t.notesTitle}</h3>
        <p className="mt-2 text-sm text-stone-600">{t.notesHint}</p>

        <form onSubmit={onAddNote} className="mt-4 grid gap-3">
          <label className="grid gap-2">
            <span className="text-xs font-medium text-stone-700">{t.addNoteLabel}</span>
            <textarea
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              rows={4}
              placeholder={t.addNotePlaceholder}
              className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900"
            />
          </label>

          <button
            type="submit"
            disabled={!noteDraft.trim() || isAddingNote}
            className="w-fit rounded-full bg-amber-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isAddingNote ? t.saving : t.addNoteAction}
          </button>
        </form>

        {feedback ? (
          <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {feedback}
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}

        <div className="mt-5 space-y-3">
          {notes.length === 0 ? <p className="text-sm text-stone-600">{t.notesEmpty}</p> : null}
          {notes.map((note) => (
            <article key={note.id} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <p className="text-sm leading-6 text-stone-800">{note.content}</p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <time className="text-xs text-stone-500">{formatDate(note.created_at, locale)}</time>
                <button
                  type="button"
                  onClick={() => onDeleteNote(note.id)}
                  disabled={deletingNoteId === note.id}
                  className="rounded-full border border-red-300 px-3 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deletingNoteId === note.id ? t.deleting : t.deleteAction}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</dt>
      <dd className="mt-1 text-sm text-stone-800">{value}</dd>
    </div>
  );
}
