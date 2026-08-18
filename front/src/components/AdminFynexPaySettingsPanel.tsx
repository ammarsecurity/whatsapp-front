import { AdminGatewaySettingsPanel } from './AdminGatewaySettingsPanel'

export function AdminFynexPaySettingsPanel() {
  return (
    <AdminGatewaySettingsPanel
      provider="fynexpay"
      title="إعدادات FynexPay"
      description="مفاتيح Test و Production محفوظة منفصلة. بدّل البيئة النشطة دون إعادة إدخال المفاتيح."
      defaultBaseUrl="https://api.fynexpay.net"
      withMerchant
    />
  )
}
