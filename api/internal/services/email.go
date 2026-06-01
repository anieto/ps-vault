package services

import (
	"bytes"
	"context"
	"crypto/tls"
	"fmt"
	"html/template"
	"log"

	"github.com/ps-vault/ps-vault/internal/config"
	mail "github.com/wneessen/go-mail"
)

type EmailService struct {
	cfg       *config.Config
	templates *template.Template
}

func NewEmailService(cfg *config.Config) *EmailService {
	svc := &EmailService{cfg: cfg}
	svc.templates = template.Must(template.New("").Parse(emailTemplates))
	return svc
}

// Send sends an email synchronously. Returns an error if sending fails.
func (s *EmailService) Send(toEmail, templateName string, data map[string]string) error {
	subject, body, err := s.render(templateName, data)
	if err != nil {
		return fmt.Errorf("rendering template %s: %w", templateName, err)
	}

	msg := mail.NewMsg()
	if err := msg.From(fmt.Sprintf("%s <%s>", s.cfg.SMTPFromName, s.cfg.SMTPFrom)); err != nil {
		return err
	}
	if err := msg.To(toEmail); err != nil {
		return err
	}
	msg.Subject(subject)
	msg.SetBodyHTMLTemplate(template.Must(template.New("body").Parse(body)), nil)

	var opts []mail.Option
	opts = append(opts, mail.WithPort(s.cfg.SMTPPort))

	switch s.cfg.SMTPTLS {
	case "tls":
		opts = append(opts, mail.WithSSL())
	case "starttls":
		opts = append(opts, mail.WithTLSConfig(&tls.Config{InsecureSkipVerify: false}))
	}

	if s.cfg.SMTPUser != "" {
		opts = append(opts, mail.WithSMTPAuth(mail.SMTPAuthPlain))
		opts = append(opts, mail.WithUsername(s.cfg.SMTPUser))
		opts = append(opts, mail.WithPassword(s.cfg.SMTPPass))
	}

	client, err := mail.NewClient(s.cfg.SMTPHost, opts...)
	if err != nil {
		return fmt.Errorf("creating mail client: %w", err)
	}

	return client.DialAndSend(msg)
}

// SendAsync sends an email in a goroutine, logging errors.
func (s *EmailService) SendAsync(ctx context.Context, toEmail, templateName string, data map[string]string) {
	go func() {
		if err := s.Send(toEmail, templateName, data); err != nil {
			log.Printf("email send failed to %s (template: %s): %v", toEmail, templateName, err)
		}
	}()
}

func (s *EmailService) render(templateName string, data map[string]string) (subject, body string, err error) {
	// Get subject
	var subjectBuf bytes.Buffer
	if err = s.templates.ExecuteTemplate(&subjectBuf, templateName+"_subject", data); err != nil {
		return "", "", err
	}
	subject = subjectBuf.String()

	// Get body
	var bodyBuf bytes.Buffer
	if err = s.templates.ExecuteTemplate(&bodyBuf, templateName+"_body", data); err != nil {
		return "", "", err
	}
	body = bodyBuf.String()

	return subject, body, nil
}

// emailTemplates contains all transactional email templates.
// Each template has a _subject and _body variant.
const emailTemplates = `
{{define "verify_email_subject"}}Verify your email — {{index . "app_name"}}{{end}}
{{define "verify_email_body"}}
<!DOCTYPE html><html><body style="font-family:Inter,sans-serif;background:#F9F8F6;padding:40px 0;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 1px 4px rgba(0,0,0,.06);">
  <h1 style="color:#1e1e1e;font-size:22px;font-weight:600;margin-bottom:8px;">Welcome to {{index . "app_name"}}</h1>
  <p style="color:#555;font-size:15px;line-height:1.6;">Hi {{index . "display_name"}},</p>
  <p style="color:#555;font-size:15px;line-height:1.6;">Please verify your email address to finish setting up your account.</p>
  <div style="text-align:center;margin:32px 0;">
    <a href="{{index . "verify_url"}}" style="background:#3b82f6;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:500;display:inline-block;">Verify Email Address</a>
  </div>
  <p style="color:#888;font-size:13px;">This link expires in 24 hours. If you didn't create an account, you can ignore this email.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="color:#aaa;font-size:12px;text-align:center;">{{index . "app_name"}}</p>
</div></body></html>
{{end}}

{{define "checkin_reminder1_subject"}}Time for your check-in — {{index . "app_name"}}{{end}}
{{define "checkin_reminder1_body"}}
<!DOCTYPE html><html><body style="font-family:Inter,sans-serif;background:#F9F8F6;padding:40px 0;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 1px 4px rgba(0,0,0,.06);">
  <h1 style="color:#1e1e1e;font-size:22px;font-weight:600;">Time for your check-in</h1>
  <p style="color:#555;font-size:15px;line-height:1.6;">Hi {{index . "display_name"}},</p>
  <p style="color:#555;font-size:15px;line-height:1.6;">Your next check-in is due in <strong>{{index . "time_left"}}</strong>. Take a moment to let your vault know you're okay.</p>
  <div style="text-align:center;margin:32px 0;">
    <a href="{{index . "checkin_url"}}" style="background:#3b82f6;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:500;display:inline-block;">Check In Now</a>
  </div>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="color:#aaa;font-size:12px;text-align:center;">{{index . "app_name"}}</p>
</div></body></html>
{{end}}

{{define "checkin_reminder2_subject"}}Check-in due soon — {{index . "app_name"}}{{end}}
{{define "checkin_reminder2_body"}}
<!DOCTYPE html><html><body style="font-family:Inter,sans-serif;background:#F9F8F6;padding:40px 0;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 1px 4px rgba(0,0,0,.06);">
  <h1 style="color:#1e1e1e;font-size:22px;font-weight:600;">Your check-in is due soon</h1>
  <p style="color:#555;font-size:15px;line-height:1.6;">Hi {{index . "display_name"}},</p>
  <p style="color:#555;font-size:15px;line-height:1.6;">You have <strong>{{index . "hours_left"}} hours</strong> left to check in before your vaults are queued for delivery.</p>
  <div style="text-align:center;margin:32px 0;">
    <a href="{{index . "checkin_url"}}" style="background:#3b82f6;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:500;display:inline-block;">Check In Now</a>
  </div>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="color:#aaa;font-size:12px;text-align:center;">{{index . "app_name"}}</p>
</div></body></html>
{{end}}

{{define "checkin_final_warning_subject"}}Final reminder — check in now{{end}}
{{define "checkin_final_warning_body"}}
<!DOCTYPE html><html><body style="font-family:Inter,sans-serif;background:#F9F8F6;padding:40px 0;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 1px 4px rgba(0,0,0,.06);border-left:4px solid #f59e0b;">
  <h1 style="color:#1e1e1e;font-size:22px;font-weight:600;">Last chance to check in</h1>
  <p style="color:#555;font-size:15px;line-height:1.6;">Hi {{index . "display_name"}},</p>
  <p style="color:#555;font-size:15px;line-height:1.6;">Your check-in deadline is almost here. If you don't check in soon, your vaults will be queued for delivery to your beneficiaries.</p>
  <div style="text-align:center;margin:32px 0;">
    <a href="{{index . "checkin_url"}}" style="background:#f59e0b;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:500;display:inline-block;">I'm Okay — Check In Now</a>
  </div>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="color:#aaa;font-size:12px;text-align:center;">{{index . "app_name"}}</p>
</div></body></html>
{{end}}

{{define "switch_triggered_subject"}}Your vaults are queued for delivery — {{index . "app_name"}}{{end}}
{{define "switch_triggered_body"}}
<!DOCTYPE html><html><body style="font-family:Inter,sans-serif;background:#F9F8F6;padding:40px 0;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 1px 4px rgba(0,0,0,.06);">
  <h1 style="color:#1e1e1e;font-size:22px;font-weight:600;">If you're reading this, please let us know you're okay.</h1>
  <p style="color:#555;font-size:15px;line-height:1.6;">Hi {{index . "display_name"}},</p>
  <p style="color:#555;font-size:15px;line-height:1.6;">Your check-in deadline passed and your vaults have been queued for delivery to your beneficiaries. Delivery will begin on <strong>{{index . "abort_deadline"}}</strong> unless you cancel it now.</p>
  <div style="text-align:center;margin:32px 0;">
    <a href="{{index . "abort_url"}}" style="background:#3b82f6;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:500;display:inline-block;">I'm Okay — Cancel Delivery</a>
  </div>
  <p style="color:#888;font-size:13px;">If you do not cancel, your beneficiaries will receive access to your vaults as you configured.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="color:#aaa;font-size:12px;text-align:center;">{{index . "app_name"}}</p>
</div></body></html>
{{end}}

{{define "trigger_aborted_subject"}}Delivery cancelled — you're all set{{end}}
{{define "trigger_aborted_body"}}
<!DOCTYPE html><html><body style="font-family:Inter,sans-serif;background:#F9F8F6;padding:40px 0;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 1px 4px rgba(0,0,0,.06);">
  <h1 style="color:#1e1e1e;font-size:22px;font-weight:600;">Delivery cancelled — you're all set</h1>
  <p style="color:#555;font-size:15px;line-height:1.6;">Hi {{index . "display_name"}},</p>
  <p style="color:#555;font-size:15px;line-height:1.6;">You've successfully cancelled the vault delivery. Your check-in timer has been reset. Remember to check in regularly so this doesn't happen again.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="color:#aaa;font-size:12px;text-align:center;">{{index . "app_name"}}</p>
</div></body></html>
{{end}}

{{define "forgot_password_subject"}}Reset your password — {{index . "app_name"}}{{end}}
{{define "forgot_password_body"}}
<!DOCTYPE html><html><body style="font-family:Inter,sans-serif;background:#F9F8F6;padding:40px 0;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 1px 4px rgba(0,0,0,.06);">
  <h1 style="color:#1e1e1e;font-size:22px;font-weight:600;margin-bottom:8px;">Reset your password</h1>
  <p style="color:#555;font-size:15px;line-height:1.6;">Hi {{index . "display_name"}},</p>
  <p style="color:#555;font-size:15px;line-height:1.6;">We received a request to reset your {{index . "app_name"}} password. Click the button below to choose a new one.</p>
  <div style="background:#fefce8;border-left:4px solid #ca8a04;border-radius:6px;padding:14px 18px;margin:20px 0;">
    <p style="color:#854d0e;font-size:13px;margin:0;line-height:1.5;"><strong>Important:</strong> Resetting your password will require you to re-enter your vault access keys, as they are tied to your password for security. Your vault data will remain intact.</p>
  </div>
  <div style="text-align:center;margin:28px 0;">
    <a href="{{index . "reset_url"}}" style="background:#3b82f6;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:500;display:inline-block;">Reset Password</a>
  </div>
  <p style="color:#888;font-size:13px;">This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="color:#aaa;font-size:12px;text-align:center;">{{index . "app_name"}}</p>
</div></body></html>
{{end}}

{{define "beneficiary_added_subject"}}You've been added as a beneficiary{{end}}
{{define "beneficiary_added_body"}}
<!DOCTYPE html><html><body style="font-family:Inter,sans-serif;background:#F9F8F6;padding:40px 0;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 1px 4px rgba(0,0,0,.06);">
  <h1 style="color:#1e1e1e;font-size:22px;font-weight:600;">You've been named as a beneficiary</h1>
  <p style="color:#555;font-size:15px;line-height:1.6;">Hi {{index . "beneficiary_name"}},</p>
  <p style="color:#555;font-size:15px;line-height:1.6;"><strong>{{index . "owner_name"}}</strong> has named you as a beneficiary in their {{index . "app_name"}} vault. This means they've chosen to share certain important information with you if they are ever unable to do so themselves.</p>
  <p style="color:#555;font-size:15px;line-height:1.6;">No action is needed from you right now. If the time ever comes, you'll receive an email with a secure link to access the information they've prepared for you.</p>
  <div style="background:#eff6ff;border-left:4px solid #3b82f6;border-radius:6px;padding:16px 20px;margin:24px 0;">
    <p style="color:#1e3a5f;font-size:14px;font-weight:600;margin:0 0 6px 0;">One important thing to know</p>
    <p style="color:#1e3a5f;font-size:14px;line-height:1.6;margin:0;">{{index . "owner_name"}} will be giving you a personal <strong>access key</strong> — a short passphrase that unlocks their vault. Keep it somewhere safe, like a sealed envelope or a secure note. <strong>Without it, the vault cannot be opened.</strong> If you haven't received it yet, ask them for it directly.</p>
  </div>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="color:#aaa;font-size:12px;text-align:center;">{{index . "app_name"}}</p>
</div></body></html>
{{end}}

{{define "beneficiary_delivery_subject"}}{{index . "owner_name"}} has left something for you{{end}}
{{define "beneficiary_delivery_body"}}
<!DOCTYPE html><html><body style="font-family:Inter,sans-serif;background:#F9F8F6;padding:40px 0;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 1px 4px rgba(0,0,0,.06);">
  <h1 style="color:#1e1e1e;font-size:22px;font-weight:600;">{{index . "owner_name"}} left something for you</h1>
  <p style="color:#555;font-size:15px;line-height:1.6;">Hi {{index . "beneficiary_name"}},</p>
  <p style="color:#555;font-size:15px;line-height:1.6;">{{index . "owner_name"}} wanted you to have access to their secure vault. Click the button below to open it.</p>
  <div style="background:#fefce8;border-left:4px solid #ca8a04;border-radius:6px;padding:16px 20px;margin:24px 0;">
    <p style="color:#854d0e;font-size:14px;font-weight:600;margin:0 0 6px 0;">You'll need your access key</p>
    <p style="color:#92400e;font-size:14px;line-height:1.6;margin:0;">To unlock the vault you'll be asked for the personal access key {{index . "owner_name"}} shared with you. Locate it before clicking through — it's the passphrase they gave you privately. Without it, the vault cannot be opened.</p>
  </div>
  <p style="color:#888;font-size:13px;font-style:italic;">This link is personal to you and will expire on {{index . "expires_at"}}.</p>
  <div style="text-align:center;margin:32px 0;">
    <a href="{{index . "portal_url"}}" style="background:#3b82f6;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:500;display:inline-block;">Access Vault</a>
  </div>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="color:#888;font-size:12px;text-align:center;">{{index . "app_name"}} is a personal tool for sharing information with loved ones.<br>It is not a substitute for a legal will or estate plan.</p>
</div></body></html>
{{end}}

{{define "beneficiary_locked_tier_subject"}}You have vault access waiting — it isn't available yet{{end}}
{{define "beneficiary_locked_tier_body"}}
<!DOCTYPE html><html><body style="font-family:Inter,sans-serif;background:#F9F8F6;padding:40px 0;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 1px 4px rgba(0,0,0,.06);">
  <h1 style="color:#1e1e1e;font-size:22px;font-weight:600;">You're in the queue</h1>
  <p style="color:#555;font-size:15px;line-height:1.6;">Hi {{index . "beneficiary_name"}},</p>
  <p style="color:#555;font-size:15px;line-height:1.6;">{{index . "owner_name"}} left you access to their vault, but set it up so that access is granted in stages. Someone else receives access first — if they don't use it within {{index . "window_days"}} days, your access will become available next.</p>
  <div style="background:#f0f9ff;border-left:4px solid #3b82f6;border-radius:6px;padding:16px 20px;margin:24px 0;">
    <p style="color:#1e40af;font-size:14px;font-weight:600;margin:0 0 6px 0;">No action needed right now</p>
    <p style="color:#1e3a8a;font-size:14px;line-height:1.6;margin:0;">You'll receive a separate email with your personal access link when your turn arrives. Keep the access key {{index . "owner_name"}} shared with you somewhere safe.</p>
  </div>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="color:#aaa;font-size:12px;text-align:center;">{{index . "app_name"}}</p>
</div></body></html>
{{end}}

{{define "trusted_contact_triggered_subject"}}A message about {{index . "owner_name"}}{{end}}
{{define "trusted_contact_triggered_body"}}
<!DOCTYPE html><html><body style="font-family:Inter,sans-serif;background:#F9F8F6;padding:40px 0;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 1px 4px rgba(0,0,0,.06);">
  <h1 style="color:#1e1e1e;font-size:22px;font-weight:600;">A note about {{index . "owner_name"}}</h1>
  <p style="color:#555;font-size:15px;line-height:1.6;">Hi {{index . "contact_name"}},</p>
  <p style="color:#555;font-size:15px;line-height:1.6;">{{index . "owner_name"}} set you as a trusted contact in {{index . "app_name"}}. Their check-in deadline has passed and their vaults are queued for delivery. You may want to reach out to them.</p>
  {{if index . "abort_url"}}<p style="color:#555;font-size:15px;line-height:1.6;">If you know {{index . "owner_name"}} is safe and this was a false alarm, you can abort the delivery on their behalf:</p>
  <p style="text-align:center;margin:28px 0;"><a href="{{index . "abort_url"}}" style="display:inline-block;background:#e07b39;color:#fff;font-size:15px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;">Abort Delivery</a></p>
  <p style="color:#888;font-size:13px;">This link can only be used once and expires when the abort window closes.</p>{{end}}
  <p style="color:#888;font-size:13px;">This is an automated notification. You have not been given access to any vault contents.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="color:#aaa;font-size:12px;text-align:center;">{{index . "app_name"}}</p>
</div></body></html>
{{end}}

{{define "trusted_contact_final_warning_subject"}}You may want to check on {{index . "owner_name"}}{{end}}
{{define "trusted_contact_final_warning_body"}}
<!DOCTYPE html><html><body style="font-family:Inter,sans-serif;background:#F9F8F6;padding:40px 0;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 1px 4px rgba(0,0,0,.06);">
  <h1 style="color:#1e1e1e;font-size:22px;font-weight:600;">You may want to reach out to {{index . "owner_name"}}</h1>
  <p style="color:#555;font-size:15px;line-height:1.6;">Hi {{index . "contact_name"}},</p>
  <p style="color:#555;font-size:15px;line-height:1.6;">{{index . "owner_name"}} has set you as a trusted contact and asked that you be notified when their check-in deadline is approaching. Their deadline is coming up soon — you may want to reach out.</p>
  <p style="color:#888;font-size:13px;">This is an automated notification. You have not been given access to any vault contents.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="color:#aaa;font-size:12px;text-align:center;">{{index . "app_name"}}</p>
</div></body></html>
{{end}}

{{define "death_report_owner_subject"}}Someone has reported your passing — please respond{{end}}
{{define "death_report_owner_body"}}
<!DOCTYPE html><html><body style="font-family:Inter,sans-serif;background:#F9F8F6;padding:40px 0;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 1px 4px rgba(0,0,0,.06);border-left:4px solid #f59e0b;">
  <h1 style="color:#1e1e1e;font-size:22px;font-weight:600;">If you're reading this, please let us know you're okay.</h1>
  <p style="color:#555;font-size:15px;line-height:1.6;">Hi {{index . "display_name"}},</p>
  <p style="color:#555;font-size:15px;line-height:1.6;"><strong>{{index . "reporter_name"}}</strong> has reported your passing and is requesting access to your vaults. If you are reading this, please click below immediately to let your contacts know you're okay.</p>
  <p style="color:#555;font-size:15px;line-height:1.6;">You have until <strong>{{index . "response_deadline"}}</strong> to respond.</p>
  <div style="text-align:center;margin:32px 0;">
    <a href="{{index . "verify_url"}}" style="background:#3b82f6;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:500;display:inline-block;">I'm Okay — Dismiss This Report</a>
  </div>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="color:#aaa;font-size:12px;text-align:center;">{{index . "app_name"}}</p>
</div></body></html>
{{end}}

{{define "email_change_verify_subject"}}Confirm your new email address — {{index . "app_name"}}{{end}}
{{define "email_change_verify_body"}}
<!DOCTYPE html><html><body style="font-family:Inter,sans-serif;background:#F9F8F6;padding:40px 0;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 1px 4px rgba(0,0,0,.06);">
  <h1 style="color:#1e1e1e;font-size:22px;font-weight:600;margin-bottom:8px;">Confirm your new email</h1>
  <p style="color:#555;font-size:15px;line-height:1.6;">You requested to change your {{index . "app_name"}} account email to <strong>{{index . "new_email"}}</strong>. Click the button below to confirm this change.</p>
  <div style="text-align:center;margin:32px 0;">
    <a href="{{index . "confirm_url"}}" style="background:#3b82f6;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:500;display:inline-block;">Confirm New Email</a>
  </div>
  <p style="color:#888;font-size:13px;">This link expires in 24 hours. If you didn't request this change, you can safely ignore this email — your current email will remain active.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="color:#aaa;font-size:12px;text-align:center;">{{index . "app_name"}}</p>
</div></body></html>
{{end}}

{{define "email_change_notice_subject"}}Your {{index . "app_name"}} email address is being changed{{end}}
{{define "email_change_notice_body"}}
<!DOCTYPE html><html><body style="font-family:Inter,sans-serif;background:#F9F8F6;padding:40px 0;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 1px 4px rgba(0,0,0,.06);">
  <h1 style="color:#1e1e1e;font-size:22px;font-weight:600;margin-bottom:8px;">Email change requested</h1>
  <p style="color:#555;font-size:15px;line-height:1.6;">A request was made to change the email address on your {{index . "app_name"}} account to <strong>{{index . "new_email"}}</strong>.</p>
  <p style="color:#555;font-size:15px;line-height:1.6;">If you made this request, no action is needed here. If you did not make this request, please sign in immediately and change your password.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="color:#aaa;font-size:12px;text-align:center;">{{index . "app_name"}}</p>
</div></body></html>
{{end}}

{{define "invite_code_subject"}}You've been invited to {{index . "app_name"}}{{end}}
{{define "invite_code_body"}}
<!DOCTYPE html><html><body style="font-family:Inter,sans-serif;background:#F9F8F6;padding:40px 0;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 1px 4px rgba(0,0,0,.06);">
  <h1 style="color:#1e1e1e;font-size:22px;font-weight:600;margin-bottom:8px;">You're invited to {{index . "app_name"}}</h1>
  <p style="color:#555;font-size:15px;line-height:1.6;">An admin has invited you to create an account. Use the code below or click the button to get started.</p>
  <div style="background:#f5f9ff;border:1px solid #dbeafe;border-radius:8px;padding:20px;margin:24px 0;text-align:center;">
    <p style="color:#888;font-size:12px;margin:0 0 6px;">Your invite code</p>
    <code style="color:#1e40af;font-size:20px;font-weight:600;letter-spacing:0.05em;">{{index . "invite_code"}}</code>
  </div>
  <div style="text-align:center;margin:32px 0;">
    <a href="{{index . "register_url"}}" style="background:#3b82f6;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:500;display:inline-block;">Create Account</a>
  </div>
  <p style="color:#888;font-size:13px;">This invite expires on {{index . "expires_at"}}. If you weren't expecting this, you can safely ignore it.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="color:#aaa;font-size:12px;text-align:center;">{{index . "app_name"}}</p>
</div></body></html>
{{end}}

{{define "checkin_grace_subject"}}Your check-in timer has been reset — {{index . "app_name"}}{{end}}
{{define "checkin_grace_body"}}
<!DOCTYPE html><html><body style="font-family:Inter,sans-serif;background:#F9F8F6;padding:40px 0;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 1px 4px rgba(0,0,0,.06);border-left:4px solid #6b7280;">
  <h1 style="color:#1e1e1e;font-size:22px;font-weight:600;">Your timer has been reset</h1>
  <p style="color:#555;font-size:15px;line-height:1.6;">Hi {{index . "display_name"}},</p>
  <p style="color:#555;font-size:15px;line-height:1.6;">{{index . "app_name"}} was briefly offline and your check-in deadline passed during that time. Your timer has been reset automatically — no action is needed on your part.</p>
  <p style="color:#555;font-size:15px;line-height:1.6;">Your next check-in is now due in <strong>{{index . "interval_days"}} day{{index . "interval_plural"}}</strong>.</p>
  <div style="text-align:center;margin:32px 0;">
    <a href="{{index . "dashboard_url"}}" style="background:#3b82f6;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:500;display:inline-block;">Go to Dashboard</a>
  </div>
  <p style="color:#aaa;font-size:13px;line-height:1.6;">If you believe this was sent in error or have concerns about your account, please log in and review your switch settings.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="color:#aaa;font-size:12px;text-align:center;">{{index . "app_name"}}</p>
</div></body></html>
{{end}}

{{define "test_email_subject"}}Test email — {{index . "app_name"}}{{end}}
{{define "test_email_body"}}
<!DOCTYPE html><html><body style="font-family:Inter,sans-serif;background:#F9F8F6;padding:40px 0;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;box-shadow:0 1px 4px rgba(0,0,0,.06);">
  <h1 style="color:#1e1e1e;font-size:22px;font-weight:600;margin-bottom:8px;">SMTP Test — {{index . "app_name"}}</h1>
  <p style="color:#555;font-size:15px;line-height:1.6;">Your email configuration is working correctly. This is a test message sent from the admin panel.</p>
  <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
  <p style="color:#aaa;font-size:12px;text-align:center;">{{index . "app_name"}}</p>
</div></body></html>
{{end}}
`
