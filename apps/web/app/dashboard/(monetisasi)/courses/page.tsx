"use client";

import Image from "next/image";

import PageSkeleton from "@/components/Skeleton";
import { useEffect, useState } from "react";
import { useLocale } from "@/lib/locale-context";
import PageHeader from "@/components/dashboard/page/PageHeader";
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
  uploadProductCover,
} from "@/lib/api-client";
import { IconBook, IconBox, IconCamera,
  IconChevronRight, IconPlus, IconTrash } from "@/components/icons";
import EmptyState from "@/components/EmptyState";
import Toggle from "@/components/Toggle";
import { confirmDelete } from "@/lib/confirm";
import { useErrorToast } from "@/lib/use-error-toast";

const EMPTY_CHAPTER: CourseChapterInput = { title: "", description: "", video_url: "" };

export default function DashboardCoursesPage() {
  const { t } = useLocale();
  // Manager template (SPEC §7.2/§14, Phase 5): PageHeader + primary
  // create action di kanan; kartu form create hanya tampil saat `adding`.
  const [courses, setCourses] = useState<DashboardCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useErrorToast(error);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [coverBusyId, setCoverBusyId] = useState<string | null>(null);

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
      .catch((err) => setError(err instanceof ApiError ? err.message : t("dashboard.pages.courses.errors.loadFailed")))
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
      setError(t("dashboard.pages.courses.errors.nameAndPriceRequired"));
      return;
    }
    if (chapters.some((ch) => !ch.title.trim() || !ch.video_url.trim())) {
      setError(t("dashboard.pages.courses.errors.chaptersRequired"));
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
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.courses.errors.createFailed"));
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
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.courses.errors.updateStatusFailed"));
    }
  }

  // handleUploadCover -- audit QA menyeluruh (14 September 2026): halaman
  // ini SEBELUMNYA tidak punya UI unggah sampul sama sekali, padahal
  // backend (ProductHandler.Update) mewajibkan cover_image_url terisi
  // sebelum kursus bisa diaktifkan -- toggle "Aktifkan" di atas SELALU
  // gagal 400 utk kursus baru tanpa fix ini. Endpoint upload sendiri
  // (uploadProductCover) sudah generik utk semua jenis produk, cukup
  // ditambahkan pemicunya di sini.
  async function handleUploadCover(course: DashboardCourse, file: File) {
    setError(null);
    setCoverBusyId(course.id);
    try {
      const { cover_image_url } = await uploadProductCover(course.id, file);
      setCourses((prev) => prev.map((c) => (c.id === course.id ? { ...c, cover_image_url } : c)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.courses.errors.uploadCoverFailed"));
    } finally {
      setCoverBusyId(null);
    }
  }

  async function handleDelete(course: DashboardCourse) {
    if (!(await confirmDelete(t("dashboard.pages.courses.confirmDeleteText").replace("{name}", course.name)))) return;
    const previous = courses;
    setCourses((prev) => prev.filter((c) => c.id !== course.id));
    setBusyId(course.id);
    try {
      await deleteProduct(course.id);
    } catch (err) {
      setCourses(previous);
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.courses.errors.deleteFailed"));
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
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.courses.errors.loadChaptersFailed"));
      setEditingId(null);
    }
  }

  async function handleSaveChapters(courseId: string) {
    if (editChapters.some((ch) => !ch.title.trim() || !ch.video_url.trim())) {
      setError(t("dashboard.pages.courses.errors.chaptersRequired"));
      return;
    }
    setError(null);
    setSavingChapters(true);
    try {
      await replaceCourseChapters(courseId, editChapters);
      await reload();
      setEditingId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("dashboard.pages.courses.errors.saveChaptersFailed"));
    } finally {
      setSavingChapters(false);
    }
  }

  if (loading) return <PageSkeleton />;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={t("dashboard.extraPages.courses")}
        description={t("dashboard.pages.courses.subtitle")}
        primaryAction={{ label: t("dashboard.pages.courses.createButton"), onClick: () => setAdding(true), icon: <IconPlus className="h-4 w-4" /> }}
      />

      {adding && (
      <div className="glass mt-6 rounded-jlg p-5 shadow-card">
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.courses.nameLabel")}</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("dashboard.pages.courses.namePlaceholder")}
                className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.courses.descriptionLabel")}</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.courses.prerequisitesLabel")}</label>
              <input
                type="text"
                value={prerequisites}
                onChange={(e) => setPrerequisites(e.target.value)}
                placeholder={t("dashboard.pages.courses.prerequisitesPlaceholder")}
                className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-app-ink">{t("dashboard.pages.courses.priceLabel")}</label>
              <input
                type="number"
                required
                min={1000}
                value={priceIDR}
                onChange={(e) => setPriceIDR(e.target.value)}
                className="w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-app-ink">{t("dashboard.pages.courses.chaptersLabel")}</label>
              <div className="flex flex-col gap-3">
                {chapters.map((ch, i) => (
                  <div key={i} className="rounded-lg border border-app-border p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-app-muted">{t("dashboard.pages.courses.chapterN").replace("{n}", String(i + 1))}</p>
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
                      placeholder={t("dashboard.pages.courses.chapterTitlePlaceholder")}
                      value={ch.title}
                      onChange={(e) =>
                        setChapters((prev) => prev.map((c, idx) => (idx === i ? { ...c, title: e.target.value } : c)))
                      }
                      className="mt-2 w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
                    />
                    <input
                      type="text"
                      placeholder={t("dashboard.pages.courses.chapterVideoPlaceholder")}
                      value={ch.video_url}
                      onChange={(e) =>
                        setChapters((prev) => prev.map((c, idx) => (idx === i ? { ...c, video_url: e.target.value } : c)))
                      }
                      className="mt-2 w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
                    />
                    <textarea
                      placeholder={t("dashboard.pages.courses.chapterDescriptionPlaceholder")}
                      value={ch.description}
                      onChange={(e) =>
                        setChapters((prev) => prev.map((c, idx) => (idx === i ? { ...c, description: e.target.value } : c)))
                      }
                      rows={2}
                      className="mt-2 w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setChapters((prev) => [...prev, { ...EMPTY_CHAPTER }])}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-app-border py-2 text-xs font-bold text-jeon-purple hover:border-jeon-purple"
                >
                  <IconPlus className="h-3.5 w-3.5" />
                  {t("dashboard.pages.courses.addChapter")}
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
                className="flex-1 rounded-lg border-2 border-jeon-ink py-2 text-xs font-bold text-app-muted hover:border-ink/30"
              >
                {t("dashboard.pages.courses.cancel")}
              </button>
              <button
                type="submit"
                disabled={creating}
                className="btn-primary flex-1 rounded-lg py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                {creating ? t("dashboard.pages.courses.creating") : t("dashboard.pages.courses.createButton")}
              </button>
            </div>
          </form>
      </div>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {courses.map((course) => (
          <div key={course.id} className="glass rounded-jmd p-4 shadow-card">
            <div className="flex items-start gap-3">
              <label
                title={course.cover_image_url ? t("dashboard.pages.courses.changeCoverTitle") : t("dashboard.pages.courses.addCoverTitle")}
                className="relative flex h-11 w-11 flex-shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg bg-jeon-purple/10"
              >
                {course.cover_image_url ? (
                  // Ukuran TETAP 44px -- label pembungkusnya h-11 w-11.
                  <Image src={course.cover_image_url} alt={course.name} width={44} height={44} className="h-full w-full object-cover" />
                ) : (
                  <IconBox className="h-4 w-4 text-jeon-purple/40" />
                )}
                <span className="absolute bottom-0 right-0 flex h-4 w-4 items-center justify-center rounded-tl-lg bg-ink/70 text-white">
                  <IconCamera className="h-2 w-2" />
                </span>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={coverBusyId === course.id}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleUploadCover(course, file);
                    e.target.value = "";
                  }}
                />
              </label>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-bold text-app-ink">{course.name}</p>
                  <span className="flex-shrink-0 text-sm font-bold text-jeon-purple">Rp {course.price_idr.toLocaleString("id-ID")}</span>
                </div>
                <p className="mt-1 text-xs text-app-muted">{t("dashboard.pages.courses.chapterCount").replace("{count}", String(course.chapter_count))}</p>
                {course.prerequisites && <p className="mt-1 text-xs text-app-muted">{t("dashboard.pages.courses.prerequisitesPrefix").replace("{text}", course.prerequisites)}</p>}
                {!course.cover_image_url && <p className="mt-1 text-xs text-amber-600">{t("dashboard.pages.courses.coverRequiredHint")}</p>}
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Toggle checked={course.is_active} onChange={() => handleToggleActive(course)} label={t("dashboard.pages.courses.activateAria").replace("{name}", course.name)} />
                <span className="text-xs font-semibold text-app-muted">{t("dashboard.pages.courses.activeLabel")}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleOpenEdit(course)}
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-jeon-purple hover:bg-jeon-purple/10"
                >
                  {t("dashboard.pages.courses.editChapters")}
                  <IconChevronRight className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(course)}
                  disabled={busyId === course.id}
                  title={t("dashboard.pages.courses.deleteTitle")}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-60"
                >
                  <IconTrash className="h-4 w-4" />
                </button>
              </div>
            </div>

            {editingId === course.id && (
              <div className="mt-4 flex flex-col gap-3 rounded-lg border border-app-border bg-jeon-purple/5 p-3">
                {editChapters.map((ch, i) => (
                  <div key={i} className="rounded-lg border-2 border-jeon-ink bg-app-surface p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-app-muted">{t("dashboard.pages.courses.chapterN").replace("{n}", String(i + 1))}</p>
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
                      placeholder={t("dashboard.pages.courses.chapterTitlePlaceholder")}
                      value={ch.title}
                      onChange={(e) =>
                        setEditChapters((prev) => prev.map((c, idx) => (idx === i ? { ...c, title: e.target.value } : c)))
                      }
                      className="mt-2 w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
                    />
                    <input
                      type="text"
                      placeholder={t("dashboard.pages.courses.chapterVideoPlaceholder")}
                      value={ch.video_url}
                      onChange={(e) =>
                        setEditChapters((prev) => prev.map((c, idx) => (idx === i ? { ...c, video_url: e.target.value } : c)))
                      }
                      className="mt-2 w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
                    />
                    <textarea
                      placeholder={t("dashboard.pages.courses.chapterDescriptionPlaceholder")}
                      value={ch.description}
                      onChange={(e) =>
                        setEditChapters((prev) => prev.map((c, idx) => (idx === i ? { ...c, description: e.target.value } : c)))
                      }
                      rows={2}
                      className="mt-2 w-full rounded-lg border border-app-border px-3 py-2 text-sm focus:border-jeon-purple focus:outline-none focus:ring-2 focus:ring-jeon-purple/20"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setEditChapters((prev) => [...prev, { ...EMPTY_CHAPTER }])}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-app-border py-2 text-xs font-bold text-jeon-purple hover:border-jeon-purple"
                >
                  <IconPlus className="h-3.5 w-3.5" />
                  {t("dashboard.pages.courses.addChapter")}
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="flex-1 rounded-lg border-2 border-jeon-ink py-2 text-xs font-bold text-app-muted hover:border-ink/30"
                  >
                    {t("dashboard.pages.courses.cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveChapters(course.id)}
                    disabled={savingChapters}
                    className="btn-primary flex-1 rounded-lg py-2 text-xs font-bold text-white disabled:opacity-60"
                  >
                    {savingChapters ? t("dashboard.pages.courses.savingChapters") : t("dashboard.pages.courses.saveChapters")}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* !adding -- bug UI/UX ditemukan 21 September 2026 (audit
            menyeluruh): CTA EmptyState sebelumnya tetap tampil bersamaan
            form create yang sudah terbuka, dua tombol nama sama sekaligus
            di layar. */}
        {courses.length === 0 && !adding && (
          <EmptyState
            icon={IconBook}
            accent="lavender"
            title={t("dashboard.pages.courses.emptyTitle")}
            text={t("dashboard.pages.courses.emptyCourses")}
            ctaLabel={t("dashboard.pages.courses.createButton")}
            onCtaClick={() => setAdding(true)}
          />
        )}
      </div>
    </div>
  );
}
