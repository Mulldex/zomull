import type { OrderStatus, ContractStatus } from '../../types'

const ORDER_COLORS: Record<OrderStatus, { bg: string; color: string; label: string }> = {
  new:              { bg: 'var(--blue-light)',   color: 'var(--blue)',   label: 'Nová' },
  pending_foreman:  { bg: 'var(--amber-light)',  color: 'var(--amber)',  label: 'Čaká – stavbyvedúci' },
  pending_director: { bg: 'var(--amber-light)',  color: 'var(--amber)',  label: 'Čaká – riaditeľ' },
  approved:         { bg: 'var(--green-light)',  color: 'var(--green)',  label: 'Schválená' },
  rejected:         { bg: 'var(--brand-red-light)', color: 'var(--brand-red)', label: 'Zamietnutá' },
}

const CONTRACT_COLORS: Record<ContractStatus, { bg: string; color: string; label: string }> = {
  new:                 { bg: 'var(--blue-light)',      color: 'var(--blue)',      label: 'Nová' },
  pending_approval:    { bg: 'var(--amber-light)',     color: 'var(--amber)',     label: 'Čaká na schválenie' },
  pending_foreman:     { bg: 'var(--amber-light)',     color: 'var(--amber)',     label: 'Čaká – stavbyvedúci' },
  pending_director:    { bg: 'var(--amber-light)',     color: 'var(--amber)',     label: 'Čaká – riaditeľ' },
  returned_for_rework: { bg: 'var(--brand-red-light)', color: 'var(--brand-red)', label: 'Vrátená na prepracovanie' },
  approved:            { bg: 'var(--green-light)',     color: 'var(--green)',     label: 'Schválená' },
  rejected:            { bg: 'var(--brand-red-light)', color: 'var(--brand-red)', label: 'Zamietnutá' },
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const c = ORDER_COLORS[status] || ORDER_COLORS.new
  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 10px',
      borderRadius: 20,
      fontSize: 11.5,
      fontWeight: 500,
      background: c.bg,
      color: c.color,
      whiteSpace: 'nowrap',
    }}>
      {c.label}
    </span>
  )
}

export function ContractStatusBadge({ status }: { status: ContractStatus }) {
  const c = CONTRACT_COLORS[status] || CONTRACT_COLORS.new
  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 10px',
      borderRadius: 20,
      fontSize: 11.5,
      fontWeight: 500,
      background: c.bg,
      color: c.color,
      whiteSpace: 'nowrap',
    }}>
      {c.label}
    </span>
  )
}
