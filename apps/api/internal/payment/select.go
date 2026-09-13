package payment

import (
	"github.com/jeonme/api/internal/duitku"
	"github.com/jeonme/api/internal/midtrans"
)

// SelectGateway -- SATU tempat yang menentukan gateway aktif untuk alur
// checkout sekali-bayar, dipanggil identik dari routes.go (proses HTTP
// server) MAUPUN main.go (proses worker, ReconcilePendingOrders) supaya
// keduanya TIDAK PERNAH bisa berbeda pilihan gateway secara tidak sengaja.
// Default (provider apa pun selain literal "duitku", termasuk string
// kosong/typo) SELALU Midtrans -- permintaan langsung pengguna "tetep
// keep midtrans untuk transaksi sandbox" berarti kegagalan konfigurasi
// harus jatuh balik ke yang sudah terbukti jalan, bukan diam-diam mencoba
// Duitku dengan kredensial kosong.
func SelectGateway(provider string, midtransClient *midtrans.Client, duitkuClient *duitku.Client, duitkuCallbackURL string) Gateway {
	if provider == "duitku" {
		return NewDuitkuGateway(duitkuClient, duitkuCallbackURL)
	}
	return NewMidtransGateway(midtransClient)
}
