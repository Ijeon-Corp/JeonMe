package payment

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jeonme/api/internal/midtrans"
)

// MidtransGateway -- adapter TIPIS di atas *midtrans.Client yang SUDAH ada
// (paket midtrans/ sendiri TIDAK diubah sama sekali -- semua logic HTTP/
// signature aslinya dipakai apa adanya, cuma dibungkus supaya bentuknya
// cocok dgn Gateway). Ini TETAP satu-satunya gateway yang dipakai untuk
// transaksi sandbox (permintaan langsung pengguna: "tetep keep midtrans
// untuk transaksi sandbox") -- lihat SelectGateway di config pemanggil.
type MidtransGateway struct {
	Client *midtrans.Client
}

func NewMidtransGateway(client *midtrans.Client) *MidtransGateway {
	return &MidtransGateway{Client: client}
}

func (g *MidtransGateway) Name() string { return "midtrans" }

func (g *MidtransGateway) CreateTransaction(ctx context.Context, in CreateTransactionInput) (*CreateTransactionResult, error) {
	txn, err := g.Client.CreateTransaction(ctx, midtrans.CreateTransactionRequest{
		OrderID:           in.OrderID,
		GrossAmountIDR:    in.GrossAmountIDR,
		ItemName:          in.ItemName,
		CustomerEmail:     in.CustomerEmail,
		FinishRedirectURL: in.FinishRedirectURL,
	})
	if err != nil {
		return nil, err
	}
	return &CreateTransactionResult{PaymentURL: txn.RedirectURL}, nil
}

func (g *MidtransGateway) GetTransactionStatus(ctx context.Context, orderID string) (*TransactionStatus, error) {
	status, err := g.Client.GetTransactionStatus(ctx, orderID)
	if err != nil {
		return nil, err
	}
	orderStatus, recognized := midtrans.StatusToOrderStatus(status.TransactionStatus, status.FraudStatus)
	return &TransactionStatus{
		OrderStatus:   orderStatus,
		Recognized:    recognized,
		PaymentType:   status.PaymentType,
		TransactionID: status.TransactionID,
	}, nil
}

func (g *MidtransGateway) ParseWebhook(body []byte) (*WebhookNotification, error) {
	var payload midtrans.NotificationPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, fmt.Errorf("midtrans: gagal decode payload webhook: %w", err)
	}
	if !midtrans.VerifySignature(payload.OrderID, payload.StatusCode, payload.GrossAmount, g.Client.ServerKey, payload.SignatureKey) {
		return nil, fmt.Errorf("midtrans: signature tidak valid")
	}
	orderStatus, recognized := midtrans.StatusToOrderStatus(payload.TransactionStatus, payload.FraudStatus)
	return &WebhookNotification{
		OrderID:       payload.OrderID,
		OrderStatus:   orderStatus,
		Recognized:    recognized,
		PaymentType:   payload.PaymentType,
		TransactionID: payload.TransactionID,
	}, nil
}
