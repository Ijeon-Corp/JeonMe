-- Modul Onboarding (permintaan langsung pengguna: "buatkan user onboarding
-- ... setiap user yang baru pertama kali login"). NULL berarti belum pernah
-- ditutup -- lihat catatan lengkap di OnboardingHandler.
ALTER TABLE users ADD COLUMN onboarding_dismissed_at TIMESTAMPTZ;
