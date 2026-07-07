// Package migrate membungkus golang-migrate agar migrasi database bisa
// dijalankan langsung dari binary aplikasi (`./api migrate up`), tanpa
// bergantung pada CLI golang-migrate terpisah yang harus diinstal manual
// di CI runner maupun di VPS. Ini menutup celah kritis di mana
// deploy-production.yml sebelumnya hanya berisi placeholder `echo` untuk
// langkah migrasi -- lihat CICD-GUIDE.md bagian 8 dan 12.
package migrate

import (
	"errors"
	"fmt"
	"log"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
)

// Run mengeksekusi subcommand migrate. sourcePath menunjuk ke folder berisi
// file *.up.sql/*.down.sql (relatif terhadap working directory proses --
// baik saat dijalankan lokal dari apps/api/, maupun di dalam image Docker
// yang meng-copy folder migrations ke ./migrations, lihat docker/api/Dockerfile).
func Run(args []string, databaseURL, sourcePath string) error {
	if len(args) < 1 {
		return errors.New("penggunaan: api migrate [up|down|status]")
	}

	m, err := migrate.New("file://"+sourcePath, databaseURL)
	if err != nil {
		return fmt.Errorf("gagal inisialisasi migrate: %w", err)
	}
	defer func() {
		srcErr, dbErr := m.Close()
		if srcErr != nil {
			log.Printf("warning: gagal menutup source migrasi: %v", srcErr)
		}
		if dbErr != nil {
			log.Printf("warning: gagal menutup koneksi database migrasi: %v", dbErr)
		}
	}()

	switch args[0] {
	case "up":
		err = m.Up()
	case "down":
		err = m.Steps(-1)
	case "status":
		version, dirty, verErr := m.Version()
		if verErr != nil {
			if errors.Is(verErr, migrate.ErrNilVersion) {
				log.Println("status migrasi: belum ada migrasi yang diterapkan")
				return nil
			}
			return fmt.Errorf("gagal membaca status migrasi: %w", verErr)
		}
		log.Printf("status migrasi: versi=%d dirty=%v", version, dirty)
		return nil
	default:
		return fmt.Errorf("subcommand migrate tidak dikenal: %q (pakai up|down|status)", args[0])
	}

	if err != nil {
		if errors.Is(err, migrate.ErrNoChange) {
			log.Println("migrasi: tidak ada perubahan (skema sudah mutakhir)")
			return nil
		}
		return fmt.Errorf("migrasi gagal: %w", err)
	}

	log.Println("migrasi selesai")
	return nil
}
