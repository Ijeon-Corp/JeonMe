"use client";

import { useEffect, useState } from "react";
import {
  ApiError,
  CourseChapterInput,
  DashboardCourse,
  DashboardCourseChapter,
  createCourse,
  deleteProduct,
  getCourseChapters,
  listCourses,
  replaceCourseChapters,
  updateProduct,
} from "@/lib/api-client";
import { IconChevronRight, IconPlus, IconTrash } from "@/components/icons";
import EmptyState from "@/components/EmptyState";
import Toggle from "@/components/Toggle";

const EMPTY_CHAPTER: CourseChapterInput = { title: "", description: "", video_url: "" };

export default function DashboardCoursesPage() {
  const [courses, setCourses] = useState<DashboardCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priceIDR, setPriceIDR] = useState("");
  const [prerequisites, setPrerequisites] = useState("");
  const [chapters, setChapters] = useState<CourseChapterInput[]>([{ ...EMPTY_CHAPTER }]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editChapters, setEditChapters] = useState<CourseChapterInput[]>([]);
  const [savingChapters, setSavingChapters] = useState(false);

  function reload() {
    return listCourses().then(setCourses);
  }

  useEffect(() => {
    reload()
      .catch((err) => setError(err instanceof ApiError ? err.message : "Gagal memuat kursus."))
      .finally(() => setLoading(false));
  }, []);

  function resetForm() {
    setName("");
    setDescription("");
    setPriceIDR("");
    setPrerequisites("");
    setChapters([{ ...EMPTY_CHAPTER }]);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const price = Number(priceIDR);
    if (!name.trim() || !price || price < 1000) {
      setError("Nama kursus wajib diisi dan harga minimal Rp1.000.");
      return;
    }
    if (chapters.some((ch) => !ch.title.trim() || !ch.video_url.trim())) {
      setError("Semua bab wajib punya judul dan tautan video.");
      return;
    }
    setError(null);
    setCreating(true);
    try {
      await createCourse({ name, description, price_idr: price, prerequisites, chapters });
      await reload();
      resetForm();
      setAdding(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal membuat kursus.");
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleActive(course: DashboardCourse) {
    const nextActive = !course.is_active;
    setCourses((prev) => prev.map((c) => (c.id === course.id ? { ...c, is_active: nextActive } : c)));
    try {
      await updateProduct(course.id, { is_active: nextActive });
    } catch (err) {
      setCourses((prev) => prev.map((c) => (c.id === course.id ? { ...c, is_active: course.is_active } : c)));
      setError(err instanceof ApiError ? err.message : "Gagal memperbarui status kursus.");
    }
  }

  async function handleDelete(course: DashboardCourse) {
    if (!window.confirm(`Hapus kursus "${course.name}"? Aksi ini tidak bisa dibatalkan.`)) return;
    const previous = courses;
    setCourses((prev) => prev.filter((c) => c.id !== course.id));
    setBusyId(course.id);
    try {
      await deleteProduct(course.id);
    } catch (err) {
      setCourses(previous);
      setError(err instanceof ApiError ? err.message : "Gagal menghapus kursus.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleOpenEdit(course: DashboardCourse) {
    setError(null);
    setEditingId(course.id);
    try {
      const chs = await getCourseChapters(course.id);
      setEditChapters(chs.map((c: DashboardCourseChapter) => ({ title: c.title, description: c.description, video_url: c.video_url })));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memuat bab kursus.");
      setEditingId(null);
    }
  }

  async function handleSaveChapters(courseId: string) {
    if (editChapters.some((ch) => !ch.title.trim() || !ch.video_url.trim())) {
      setError("Semua bab wajib punya judul dan tautan video.");
      return;
    }
    setError(null);
    setSavingChapters(true);
    try {
      await replaceCourseChapters(courseId, editChapters);
      await reload();
      setEditingId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan bab kursus.");
    } finally {
      setSavingChapters(false);
    }
  }

  if (loading) return <p className="text-sm text-muted">Memuat...</p>;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-heading text-2xl font-bold text-ink">Kelas & Kursus</h1>
      <p className="mt-1 text-sm text-muted">
        Jual kursus video terstruktur per-bab dengan prasyarat & deskripsi pembelajaran. Video wajib tautan
        YouTube atau TikTok.
      </p>

      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="mt-6 rounded-2xl border border-border bg-white p-5 shadow-card">
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 text-sm font-bold text-primary hover:underline"
          >
            <IconPlus className="h-4 w-4" />
            Buat Kursus
          </button>
        ) : (
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Nama Kursus</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Belajar Fotografi dari Nol"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Deskripsi Pembelajaran</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Prasyarat (opsional)</label>
              <input
                type="text"
                value={prerequisites}
                onChange={(e) => setPrerequisites(e.target.value)}
                placeholder="Sudah punya kamera DSLR/mirrorless"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink">Harga (Rp)</label>
              <input
                type="number"
                required
                min={1000}
                value={priceIDR}
                onChange={(e) => setPriceIDR(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink">Bab Kursus</label>
              <div className="flex flex-col gap-3">
                {chapters.map((ch, i) => (
                  <div key={i} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-muted">Bab {i + 1}</p>
                      {chapters.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setChapters((prev) => prev.filter((_, idx) => idx !== i))}
                          className="text-red-600 hover:underline"
                        >
                          <IconTrash className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      placeholder="Judul bab"
                      value={ch.title}
                      onChange={(e) =>
                        setChapters((prev) => prev.map((c, idx) => (idx === i ? { ...c, title: e.target.value } : c)))
                      }
                      className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <input
                      type="text"
                      placeholder="Tautan video (YouTube/TikTok)"
                      value={ch.video_url}
                      onChange={(e) =>
                        setChapters((prev) => prev.map((c, idx) => (idx === i ? { ...c, video_url: e.target.value } : c)))
                      }
                      className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <textarea
                      placeholder="Deskripsi bab (opsional)"
                      value={ch.description}
                      onChange={(e) =>
                        setChapters((prev) => prev.map((c, idx) => (idx === i ? { ...c, description: e.target.value } : c)))
                      }
                      rows={2}
                      className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setChapters((prev) => [...prev, { ...EMPTY_CHAPTER }])}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-xs font-bold text-primary hover:border-primary"
                >
                  <IconPlus className="h-3.5 w-3.5" />
                  Tambah Bab
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  resetForm();
                }}
                className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-muted hover:border-ink/30"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={creating}
                className="btn-primary flex-1 rounded-lg py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                {creating ? "Membuat..." : "Buat Kursus"}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {courses.map((course) => (
          <div key={course.id} className="rounded-2xl border border-border bg-white p-4 shadow-card">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-ink">{course.name}</p>
              <span className="text-sm font-bold text-secondary-dark">Rp {course.price_idr.toLocaleString("id-ID")}</span>
            </div>
            <p className="mt-1 text-xs text-muted">{course.chapter_count} bab</p>
            {course.prerequisites && <p className="mt-1 text-xs text-muted">Prasyarat: {course.prerequisites}</p>}

            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Toggle checked={course.is_active} onChange={() => handleToggleActive(course)} label={`Aktifkan ${course.name}`} />
                <span className="text-xs font-semibold text-muted">Aktif</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleOpenEdit(course)}
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary-subtle"
                >
                  Edit Bab
                  <IconChevronRight className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(course)}
                  disabled={busyId === course.id}
                  title="Hapus kursus"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-60"
                >
                  <IconTrash className="h-4 w-4" />
                </button>
              </div>
            </div>

            {editingId === course.id && (
              <div className="mt-4 flex flex-col gap-3 rounded-lg border border-border bg-primary-subtle/20 p-3">
                {editChapters.map((ch, i) => (
                  <div key={i} className="rounded-lg border border-border bg-white p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-muted">Bab {i + 1}</p>
                      {editChapters.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setEditChapters((prev) => prev.filter((_, idx) => idx !== i))}
                          className="text-red-600 hover:underline"
                        >
                          <IconTrash className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      placeholder="Judul bab"
                      value={ch.title}
                      onChange={(e) =>
                        setEditChapters((prev) => prev.map((c, idx) => (idx === i ? { ...c, title: e.target.value } : c)))
                      }
                      className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <input
                      type="text"
                      placeholder="Tautan video (YouTube/TikTok)"
                      value={ch.video_url}
                      onChange={(e) =>
                        setEditChapters((prev) => prev.map((c, idx) => (idx === i ? { ...c, video_url: e.target.value } : c)))
                      }
                      className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <textarea
                      placeholder="Deskripsi bab (opsional)"
                      value={ch.description}
                      onChange={(e) =>
                        setEditChapters((prev) => prev.map((c, idx) => (idx === i ? { ...c, description: e.target.value } : c)))
                      }
                      rows={2}
                      className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setEditChapters((prev) => [...prev, { ...EMPTY_CHAPTER }])}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-xs font-bold text-primary hover:border-primary"
                >
                  <IconPlus className="h-3.5 w-3.5" />
                  Tambah Bab
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-muted hover:border-ink/30"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveChapters(course.id)}
                    disabled={savingChapters}
                    className="btn-primary flex-1 rounded-lg py-2 text-xs font-bold text-white disabled:opacity-60"
                  >
                    {savingChapters ? "Menyimpan..." : "Simpan Bab"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {courses.length === 0 && <EmptyState text='Belum ada kursus -- klik "Buat Kursus" di atas untuk membuat yang pertama.' />}
      </div>
    </div>
  );
}
