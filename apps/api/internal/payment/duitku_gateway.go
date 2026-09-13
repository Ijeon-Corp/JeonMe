package payment

import (
	"context"
	"fmt"
	"net/url"

	"github.com/jeonme/api/internal/duitku"
)

// DuitkuGateway -- adapter Gateway di atas *duitku.Client, pola sama
// persis MidtransGateway. CallbackURL diisi SEKALI saat konstruksi (bukan
// per-CreateTransaction seperti FinishRedirectURL) karena nilainya selalu
// sama (endpoint webhook API sendiri) -- lihat pemanggilan NewDuitkuGateway
// di routes.go.
type DuitkuGateway struct {
	Client      *duitku.Client
	CallbackURL string
}

func NewDuitkuGateway(client *duitku.Client, callbackURL string) *DuitkuGateway {
	return &DuitkuGateway{Client: client, CallbackURL: callbackURL}
}

func (g *DuitkuGateway) Name() string { return "duitku" }

func (g *DuitkuGateway) CreateTransaction(ctx context.Context, in CreateTransactionInput) (*CreateTransactionResult, error) {
	txn, err := g.Client.CreateTransaction(ctx, duitku.CreateTransactionRequest{
		OrderID:           in.OrderID,
		GrossAmountIDR:    in.GrossAmountIDR,
		ItemName:          in.ItemName,
		CustomerEmail:     in.CustomerEmail,
		FinishRedirectURL: in.FinishRedirectURL,
		CallbackURL:       g.CallbackURL,
	})
	if err != nil {
		return nil, err
	}
	return &CreateTransactionResult{PaymentURL: txn.PaymentURL}, nil
}

func (g *DuitkuGateway) GetTransactionStatus(ctx context.Context, orderID string) (*TransactionStatus, error) {
	status, err := g.Client.GetTransactionStatus(ctx, orderID)
	if err != nil {
		return nil, err
	}
	orderStatus, recognized := duitku.StatusCodeToOrderStatus(status.StatusCode)
	return &TransactionStatus{
		OrderStatus: orderStatus,
		Recognized:  recognized,
		// PaymentType/TransactionID -- dokumentasi status Duitku tidak
		// mengembalikan kanal pembayaran sungguhan di endpoint ini (beda
		// dari Midtrans) -- dikosongkan apa adanya alih-alih menebak.
		PaymentType:   "",
		TransactionID: status.Reference,
	}, nil
}

// ParseWebhook -- BEDA dari MidtransGateway: Duitku mengirim callback
// sbg application/x-www-form-urlencoded (bukan JSON), jadi `body` di sini
// di-parse sbg query string, bukan json.Unmarshal. Handler HTTP pemanggil
// (checkout.go) tetap membaca body mentah dgn cara yang SAMA utk kedua
// gateway (io.ReadAll biasa) -- perbedaan format cukup disembunyikan di
// sini, tidak bocor ke handler.
func (g *DuitkuGateway) ParseWebhook(body []byte) (*WebhookNotification, error) {
	values, err := url.ParseQuery(string(body))
	if err != nil {
		return nil, fmt.Errorf("duitku: gagal parse body callback: %w", err)
	}
	merchantCode := values.Get("merchantCode")
	amount := values.Get("amount")
	orderID := values.Get("merchantOrderId")
	resultCode := values.Get("resultCode")
	reference := values.Get("reference")
	signature := values.Get("signature")

	if !duitku.VerifyCallbackSignature(merchantCode, amount, orderID, g.Client.APIKey, signature) {
		return nil, fmt.Errorf("duitku: signature tidak valid")
	}

	orderStatus, recognized := duitku.ResultCodeToOrderStatus(resultCode)
	return &WebhookNotification{
		OrderID:       orderID,
		OrderStatus:   orderStatus,
		Recognized:    recognized,
		PaymentType:   values.Get("paymentCode"),
		TransactionID: reference,
	}, nil
}
