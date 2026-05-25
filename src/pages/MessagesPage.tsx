import { Phone, Send } from 'lucide-react'
import { useState } from 'react'
import { JsonBlock } from '../components/JsonBlock'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Textarea } from '../components/ui/Textarea'
import { api, ApiClientError } from '../lib/api'
import { getAccountId } from '../lib/storage'

export function MessagesPage() {
  const [accountId] = useState(getAccountId)
  const [phoneNumber, setPhoneNumber] = useState('9647807110011')
  const [message, setMessage] = useState('hello!')
  const [phoneList, setPhoneList] = useState('9647807110011')
  const [checkResult, setCheckResult] = useState<unknown>(null)
  const [sendResult, setSendResult] = useState<unknown>(null)
  const [loading, setLoading] = useState<'check' | 'send' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function checkNumber() {
    setLoading('check')
    setError(null)
    try {
      const data = await api.checkNumber({ accountId, phoneNumber })
      setCheckResult(data)
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'Check failed',
      )
      setCheckResult(err instanceof ApiClientError ? err.body : null)
    } finally {
      setLoading(null)
    }
  }

  async function sendMessage() {
    setLoading('send')
    setError(null)
    const phoneNumbers = phoneList
      .split(/[\n,;]+/)
      .map((p) => p.trim())
      .filter(Boolean)

    if (!phoneNumbers.length) {
      setError('Add at least one phone number')
      setLoading(null)
      return
    }

    try {
      const data = await api.sendMessage({
        accountId,
        message,
        phoneNumbers,
      })
      setSendResult(data)
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'Send failed',
      )
      setSendResult(err instanceof ApiClientError ? err.body : null)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
        <p className="mt-1 text-sm text-muted">
          Verify numbers and send WhatsApp messages via account{' '}
          <code className="rounded bg-card px-1.5 py-0.5 text-wa-green">
            {accountId}
          </code>
        </p>
      </header>

      {error && (
        <Alert variant="error" title="Error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Check number"
          description="POST /api/messages/check-number"
          action={<Phone className="h-4 w-4 text-muted" />}
        >
          <div className="space-y-3">
            <Input
              label="Phone number"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="9647807110011"
              hint="Include country code, no + sign"
            />
            <Button loading={loading === 'check'} onClick={checkNumber}>
              Check on WhatsApp
            </Button>
            {checkResult !== null && (
              <div className="pt-2">
                <JsonBlock data={checkResult} />
              </div>
            )}
          </div>
        </Card>

        <Card
          title="Send message"
          description="POST /api/messages/send"
          action={<Send className="h-4 w-4 text-muted" />}
        >
          <div className="space-y-3">
            <Textarea
              label="Message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
            />
            <Textarea
              label="Recipients"
              value={phoneList}
              onChange={(e) => setPhoneList(e.target.value)}
              rows={3}
              hint="One per line, or comma-separated"
            />
            <Button loading={loading === 'send'} onClick={sendMessage}>
              Send message
            </Button>
            {sendResult !== null && (
              <div className="pt-2">
                <JsonBlock data={sendResult} />
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
