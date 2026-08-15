package handlers

import (
	"errors"
	"strings"

	"github.com/go-playground/validator/v10"
)

// validationMessage menerjemahkan error binding Gin/validator ke pesan
// user-facing generik dalam bahasa Indonesia. Audit keamanan 15 Agustus
// 2026: sebelumnya ShouldBindJSON mengembalikan err.Error() apa adanya ke
// klien -- pesan itu membocorkan nama field struct internal Go (mis.
// "loginRequest.Password") dan kontrak validasi (mis. "min=8"), membantu
// penyerang memetakan API. Sekarang pesan asli dicatat di log server saja,
// ke klien hanya dikirim label ramah manusia.
//
// Strategi: petakan tag validator umum ke frasa Indonesia; bila tidak cocok,
// jatuh ke pesan generik "input tidak valid" (tidak pernah membocorkan
// nama field/struct). Field "required" memang disebut namanya karena
// bermanfaat bagi pengguna sah dan nama field di JSON sudah publik lewat
// kontrak API resmi (bukan nama struct Go).
//
// CATATAN IMPLEMENTASI: validator.ValidationErrors & validator.FieldError
// berasal dari github.com/go-playground/validator/v10 -- paket gin/binding
// TIDAK mengekspor ulang tipe-tipe ini (cek binding.go/default_validator.go
// gin v1.10.0), jangan pakai binding.ValidationErrors.
func validationMessage(err error) string {
	if err == nil {
		return ""
	}

	// validator.ValidationErrors bungkus banyak error; ambil pesan per-field.
	var verrs validator.ValidationErrors
	if errors.As(err, &verrs) {
		msgs := make([]string, 0, len(verrs))
		for _, ve := range verrs {
			msgs = append(msgs, fieldValidationMessage(ve))
		}
		// Banyak error sekaligus (mis. email+password kosong) -> gabung,
		// tapi tetap tanpa nama struct.
		return strings.Join(msgs, "; ")
	}

	// JSON salah format (mis. field bukan tipe yang diminta, body bukan JSON
	// valid). Gin/internal/json mengembalikan error decoder json standar
	// (UnmarshalTypeError / SyntaxError) -- deteksi lewat pesan agar tidak
	// membocorkan detail internal. Tidak ada binding.ErrConvertToTyped yang
	// diekspor gin, jadi cek string "cannot unmarshal" (pesan standar
	// encoding/json & sonic utk tipe salah) + "invalid character" (JSON rusak).
	msg := err.Error()
	if strings.Contains(msg, "cannot unmarshal") || strings.Contains(msg, "invalid character") {
		return "format JSON tidak valid"
	}

	// Fallback aman: tidak membocorkan apa pun.
	return "input tidak valid"
}

// fieldValidationMessage -- satu field, satu tag validator. ve.StructField()
// = nama field struct (mis. "Password") -- jangan kirim apa adanya.
// ve.Namespace()/ve.Field() juga bisa bocor struct. Pakai nama JSON yang
// sudah lowercased & dipublikasikan. Pesan eksplisit per tag umum.
func fieldValidationMessage(ve validator.FieldError) string {
	field := jsonFieldName(ve)

	switch ve.Tag() {
	case "required":
		return field + " wajib diisi"
	case "email":
		return field + " harus berupa email yang valid"
	case "min":
		return field + " terlalu pendek"
	case "max":
		return field + " terlalu panjang"
	case "len":
		return field + " tidak memiliki panjang yang benar"
	case "oneof":
		return field + " berisi nilai yang tidak diizinkan"
	case "uuid":
		return field + " harus berupa ID yang valid"
	case "uuid4":
		return field + " harus berupa ID yang valid"
	case "numeric":
		return field + " harus berupa angka"
	case "boolean":
		return field + " harus berupa true atau false"
	case "url":
		return field + " harus berupa URL yang valid"
	case "datetime":
		return field + " format tanggal/waktu tidak valid"
	default:
		// Tag tak dikenal -- jangan bocorkan tag/param asli.
		return field + " tidak valid"
	}
}

// jsonFieldName mengembalikan nama field yang aman ditampilkan ke pengguna:
// nama struct field dengan huruf pertama kecil (Password -> password). Ini
// BUKAN kebocoran struktur -- nama field JSON (snake_case lewat tag json)
// memang bagian publik dari kontrak API yang sah; di sini kita cuma pakai
// nama field yang ramah dibaca, bukan nama struct lengkap (loginRequest.Password).
func jsonFieldName(ve validator.FieldError) string {
	if s := ve.StructField(); s != "" {
		return strings.ToLower(s[:1]) + s[1:]
	}
	return "input"
}