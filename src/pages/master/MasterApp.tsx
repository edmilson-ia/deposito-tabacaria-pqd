import { CalendarClock, CircleDollarSign, Lock, LockOpen, LogOut, PlayCircle, Store, UserRound } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { ErrorState } from '@/components/States'
import { Button } from '@/components/ui/button'
import { useMasterAcao, useMasterEstado, type MasterEstado } from '@/hooks/useMaster'
import { AuthProvider, useAuth } from '@/lib/auth'
import { parseValor } from '@/lib/schemas'
import { cn, formatBRL, NOME_LOJA } from '@/lib/utils'
import AdminLogin from '../admin/AdminLogin'

const inputCls = 'h-11 w-full rounded-lg border-2 border-preto bg-white px-3 text-sm font-semibold text-preto'

const fmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

/** ISO -> valor do <input type="datetime-local"> (hora local) */
function paraInputLocal(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

const ACOES: Record<string, string> = {
  pagamento: 'Pagamento registrado',
  teste_iniciado: 'Teste iniciado',
  vencimento_alterado: 'Vencimento alterado',
  plano_alterado: 'Plano alterado',
  bloqueio: 'Bloqueio manual',
  liberacao_manual: 'Bloqueio removido',
  cliente_atualizado: 'Cliente atualizado',
}

function situacao(m: MasterEstado): { texto: string; detalhe: string; cor: string } {
  const e = m.estado
  if (e.bloqueada) return { texto: 'BLOQUEADA', detalhe: 'Bloqueio manual: novos pedidos recusados.', cor: 'bg-red-300' }
  if (!e.ativa)
    return e.plano === 'mensal'
      ? { texto: 'TRAVADA — mensalidade vencida', detalhe: 'Passou o vencimento e a carência: novos pedidos recusados até você autorizar.', cor: 'bg-red-300' }
      : { texto: 'TRAVADA — teste encerrado', detalhe: 'O teste acabou: novos pedidos recusados até você autorizar.', cor: 'bg-red-300' }
  if (e.em_carencia) return { texto: 'Vencida — em carência', detalhe: 'Ainda aceita pedidos; trava quando a carência acabar.', cor: 'bg-ambar' }
  if (e.plano === 'isento') return { texto: 'Isento', detalhe: 'Sem cobrança: nunca vence.', cor: 'bg-zap' }
  if (e.em_teste) return { texto: 'Em teste', detalhe: 'Trava sozinho quando o prazo acabar.', cor: 'bg-bege' }
  if (e.plano === 'mensal') return { texto: 'Mensalidade em dia', detalhe: 'Trava sozinha depois do vencimento + carência.', cor: 'bg-zap' }
  return { texto: 'Sem prazo definido', detalhe: 'Nenhum vencimento configurado: loja liberada.', cor: 'bg-bege' }
}

function Cartao({ titulo, icone, children }: { titulo: string; icone: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border-2 border-preto bg-bege p-4 text-preto shadow-adesivo-sm">
      <h2 className="flex items-center gap-2 text-2xl">
        {icone}
        {titulo}
      </h2>
      {children}
    </section>
  )
}

function Campo({ id, label, dica, children }: { id: string; label: string; dica?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-extrabold">
        {label}
      </label>
      {children}
      {dica && <p className="mt-1 text-xs text-preto/70">{dica}</p>}
    </div>
  )
}

/** Botão de duas etapas para ações sensíveis. */
function ComConfirmacao({ rotulo, pergunta, onConfirmar, pendente, perigo }: { rotulo: ReactNode; pergunta: string; onConfirmar: () => void; pendente: boolean; perigo?: boolean }) {
  const [aberto, setAberto] = useState(false)
  if (!aberto)
    return (
      <Button variant={perigo ? 'outline' : 'default'} className={cn(perigo && 'border-red-800 text-red-800')} onClick={() => setAberto(true)}>
        {rotulo}
      </Button>
    )
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border-2 border-preto bg-white p-2">
      <p className="text-sm font-bold">{pergunta}</p>
      <Button size="sm" disabled={pendente} className={cn(perigo && 'bg-red-700 text-white hover:bg-red-800')} onClick={() => { onConfirmar(); setAberto(false) }}>
        Confirmar
      </Button>
      <Button size="sm" variant="outline" onClick={() => setAberto(false)}>
        Cancelar
      </Button>
    </div>
  )
}

function Painel({ m }: { m: MasterEstado }) {
  const acao = useMasterAcao()
  const l = m.licenca
  const s = situacao(m)

  const executar = (a: Parameters<typeof acao.mutate>[0], ok: string) =>
    acao.mutate(a, { onSuccess: () => toast.success(ok), onError: (e) => toast.error(e.message) })

  // formulários
  const [dias, setDias] = useState('30')
  const [valor, setValor] = useState(l.valor_mensal != null ? String(l.valor_mensal).replace('.', ',') : '')
  const [obs, setObs] = useState('')
  const [diasTeste, setDiasTeste] = useState('7')
  const [semData, setSemData] = useState(l.valido_ate === null)
  const [vence, setVence] = useState(paraInputLocal(l.valido_ate))
  const [carencia, setCarencia] = useState(String(l.carencia_dias))
  const [motivo, setMotivo] = useState('')
  const [plano, setPlano] = useState(l.plano)
  const [cliente, setCliente] = useState(l.cliente_nome ?? '')
  const [mensal, setMensal] = useState(l.valor_mensal != null ? String(l.valor_mensal).replace('.', ',') : '')

  const inteiro = (t: string, min: number, max: number) => {
    const n = Number(t.trim())
    return Number.isInteger(n) && n >= min && n <= max ? n : null
  }

  function pagar() {
    const d = inteiro(dias, 1, 366)
    if (d === null) return toast.error('Informe de 1 a 366 dias.')
    const v = valor.trim() === '' ? null : parseValor(valor)
    if (v !== null && (!Number.isFinite(v) || v < 0)) return toast.error('Valor inválido.')
    executar({ fn: 'master_registrar_pagamento', args: { p_dias: d, p_valor: v, p_obs: obs.trim() || null } }, `Pagamento registrado (+${d} dias). Loja liberada.`)
    setObs('')
  }

  return (
    <div className="space-y-4">
      <section className={cn('rounded-xl border-2 border-preto p-4 text-preto shadow-adesivo', s.cor)} role="status">
        <p className="text-xs font-extrabold uppercase tracking-wide">Situação da loja</p>
        <p className="font-titulo text-4xl leading-tight">{s.texto}</p>
        <p className="text-sm font-semibold">{s.detalhe}</p>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
          <div><dt className="text-xs font-bold opacity-70">Plano</dt><dd className="font-extrabold capitalize">{l.plano}</dd></div>
          <div><dt className="text-xs font-bold opacity-70">Vencimento</dt><dd className="font-extrabold">{l.plano === 'isento' ? 'Nunca' : fmt(l.valido_ate)}</dd></div>
          <div><dt className="text-xs font-bold opacity-70">Dias restantes</dt><dd className="font-extrabold">{m.estado.dias_restantes ?? '—'}</dd></div>
          <div><dt className="text-xs font-bold opacity-70">Carência (mensal)</dt><dd className="font-extrabold">{l.carencia_dias} dias</dd></div>
          <div><dt className="text-xs font-bold opacity-70">Último pagamento</dt><dd className="font-extrabold">{fmt(l.ultimo_pagamento_em)}</dd></div>
          <div><dt className="text-xs font-bold opacity-70">Cliente / mensalidade</dt><dd className="font-extrabold">{l.cliente_nome ?? '—'}{l.valor_mensal != null ? ` · ${formatBRL(l.valor_mensal)}` : ''}</dd></div>
        </dl>
        {l.bloqueada && l.motivo_bloqueio && <p className="mt-2 rounded-lg bg-white/70 p-2 text-sm font-bold">Motivo: {l.motivo_bloqueio}</p>}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Cartao titulo="Registrar pagamento" icone={<CircleDollarSign className="h-6 w-6" aria-hidden />}>
          <p className="text-sm">Reativa a loja e soma os dias. Pagou em dia: soma ao vencimento atual. Pagou atrasado: conta a partir de hoje.</p>
          <div className="grid grid-cols-2 gap-3">
            <Campo id="m-dias" label="Dias pagos"><input id="m-dias" inputMode="numeric" value={dias} onChange={(e) => setDias(e.target.value)} className={inputCls} /></Campo>
            <Campo id="m-valor" label="Valor (R$)"><input id="m-valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="opcional" className={inputCls} /></Campo>
          </div>
          <Campo id="m-obs" label="Observação (opcional)"><input id="m-obs" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: PIX 21/09" className={inputCls} /></Campo>
          <Button onClick={pagar} disabled={acao.isPending} className="w-full">Registrar pagamento e liberar</Button>
        </Cartao>

        <Cartao titulo="Bloqueio manual" icone={l.bloqueada ? <LockOpen className="h-6 w-6" aria-hidden /> : <Lock className="h-6 w-6" aria-hidden />}>
          {l.bloqueada ? (
            <>
              <p className="text-sm">A loja está bloqueada por você. Remover o bloqueio libera se o prazo ainda estiver válido; se estiver vencido, registre pagamento ou defina novo vencimento.</p>
              <Button onClick={() => executar({ fn: 'master_liberar', args: {} }, 'Bloqueio removido.')} disabled={acao.isPending} className="w-full">Remover bloqueio</Button>
            </>
          ) : (
            <>
              <p className="text-sm">Trava novos pedidos <strong>agora</strong>, mesmo com prazo válido. Nada é apagado.</p>
              <Campo id="m-motivo" label="Motivo (só você vê)"><input id="m-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: mensalidade de outubro em aberto" className={inputCls} /></Campo>
              <ComConfirmacao perigo pendente={acao.isPending} rotulo={<><Lock className="h-4 w-4" aria-hidden /> Bloquear agora</>} pergunta="Bloquear novos pedidos da loja agora?" onConfirmar={() => executar({ fn: 'master_bloquear', args: { p_motivo: motivo.trim() || null } }, 'Loja bloqueada.')} />
            </>
          )}
        </Cartao>

        <Cartao titulo="Iniciar teste" icone={<PlayCircle className="h-6 w-6" aria-hidden />}>
          <p className="text-sm">Começa (ou reinicia) o período de teste a partir de agora. Ao acabar, a loja trava sozinha.</p>
          <Campo id="m-teste" label="Dias de teste"><input id="m-teste" inputMode="numeric" value={diasTeste} onChange={(e) => setDiasTeste(e.target.value)} className={inputCls} /></Campo>
          <ComConfirmacao pendente={acao.isPending} rotulo="Iniciar teste" pergunta="Iniciar o teste agora?" onConfirmar={() => {
            const d = inteiro(diasTeste, 1, 90)
            if (d === null) return toast.error('Informe de 1 a 90 dias.')
            executar({ fn: 'master_iniciar_teste', args: { p_dias: d } }, `Teste de ${d} dias iniciado.`)
          }} />
        </Cartao>

        <Cartao titulo="Vencimento e carência" icone={<CalendarClock className="h-6 w-6" aria-hidden />}>
          <p className="text-sm">Ajuste manual da data em que a loja trava. A carência vale só no plano mensal.</p>
          <label className="flex items-center gap-2 text-sm font-extrabold">
            <input type="checkbox" checked={semData} onChange={(e) => setSemData(e.target.checked)} className="h-5 w-5 accent-verde" /> Sem data (sem prazo)
          </label>
          {!semData && <Campo id="m-vence" label="Vence em"><input id="m-vence" type="datetime-local" value={vence} onChange={(e) => setVence(e.target.value)} className={inputCls} /></Campo>}
          <Campo id="m-car" label="Carência (dias após o vencimento)"><input id="m-car" inputMode="numeric" value={carencia} onChange={(e) => setCarencia(e.target.value)} className={inputCls} /></Campo>
          <Button onClick={() => {
            const c = inteiro(carencia, 0, 60)
            if (c === null) return toast.error('A carência deve ficar entre 0 e 60 dias.')
            if (!semData && !vence) return toast.error('Informe a data de vencimento.')
            executar({ fn: 'master_definir_vencimento', args: { p_valido_ate: semData ? null : new Date(vence).toISOString(), p_carencia: c } }, 'Vencimento atualizado.')
          }} disabled={acao.isPending} className="w-full">Salvar vencimento</Button>
        </Cartao>

        <Cartao titulo="Plano" icone={<Store className="h-6 w-6" aria-hidden />}>
          <Campo id="m-plano" label="Tipo de licença" dica="Teste e mensal vencem. Isento nunca vence (use para parceiros ou quando o cliente pagar por fora).">
            <select id="m-plano" value={plano} onChange={(e) => setPlano(e.target.value as typeof plano)} className={inputCls}>
              <option value="teste">Teste</option>
              <option value="mensal">Mensal</option>
              <option value="isento">Isento (sem cobrança)</option>
            </select>
          </Campo>
          <ComConfirmacao pendente={acao.isPending} rotulo="Salvar plano" pergunta={`Mudar o plano para ${plano}?`} onConfirmar={() => executar({ fn: 'master_definir_plano', args: { p_plano: plano } }, 'Plano atualizado.')} />
        </Cartao>

        <Cartao titulo="Cliente e mensalidade" icone={<UserRound className="h-6 w-6" aria-hidden />}>
          <Campo id="m-cli" label="Nome do cliente"><input id="m-cli" value={cliente} onChange={(e) => setCliente(e.target.value)} className={inputCls} /></Campo>
          <Campo id="m-val" label="Valor da mensalidade (R$)"><input id="m-val" inputMode="decimal" value={mensal} onChange={(e) => setMensal(e.target.value)} placeholder="Ex.: 120,00" className={inputCls} /></Campo>
          <Button onClick={() => {
            const v = mensal.trim() === '' ? null : parseValor(mensal)
            if (v !== null && (!Number.isFinite(v) || v < 0)) return toast.error('Valor inválido.')
            executar({ fn: 'master_definir_cliente', args: { p_nome: cliente.trim() || null, p_valor: v } }, 'Dados do cliente salvos.')
          }} disabled={acao.isPending} className="w-full">Salvar</Button>
        </Cartao>
      </div>

      <section className="rounded-xl border-2 border-preto bg-bege p-4 text-preto">
        <h2 className="mb-2 text-2xl">Histórico</h2>
        {m.historico.length === 0 ? (
          <p className="text-sm">Nenhuma ação registrada ainda.</p>
        ) : (
          <ul className="divide-y divide-preto/15 text-sm">
            {m.historico.map((h) => (
              <li key={h.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
                <span className="w-36 shrink-0 text-xs text-preto/70">{fmt(h.criado_em)}</span>
                <span className="font-extrabold">{ACOES[h.acao] ?? h.acao}</span>
                {h.dias != null && <span>{h.dias} dias</span>}
                {h.valor != null && <span>{formatBRL(h.valor)}</span>}
                {h.valido_ate_novo && <span>→ vence {fmt(h.valido_ate_novo)}</span>}
                {h.observacao && <span className="italic">“{h.observacao}”</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Guard() {
  const { carregando, sessao, master, sair } = useAuth()
  const local = useLocation()
  const estado = useMasterEstado()

  useEffect(() => {
    document.title = `Painel do sistema — ${NOME_LOJA}`
  }, [])

  if (carregando) return <div className="flex min-h-dvh items-center justify-center"><div className="shimmer h-12 w-48 rounded-xl border-2 border-preto" role="status" aria-label="Carregando" /></div>
  if (!sessao) return <Navigate to="/master/login" replace state={{ de: local.pathname }} />
  if (!master) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-3xl">Acesso restrito</h1>
        <p className="text-sm">Esta área é só do dono do sistema.</p>
        <Link to="/admin" className="font-bold underline">Ir para o painel da loja</Link>
        <Button variant="outline" onClick={sair}>Sair</Button>
      </div>
    )
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b-2 border-preto bg-verde-escuro">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2">
          <img src="/branding/mark-96.png" alt="" className="h-9 w-9 rounded-full border-2 border-preto" />
          <div className="min-w-0">
            <p className="truncate font-titulo text-lg leading-none">Painel do sistema</p>
            <p className="truncate text-[11px] font-bold text-bege/70">{NOME_LOJA}</p>
          </div>
          <Link to="/admin" className="ml-auto text-sm font-bold underline underline-offset-2">Painel da loja</Link>
          <Button variant="ghost" size="sm" onClick={sair} aria-label="Sair do painel"><LogOut className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Sair</span></Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-4">
        {estado.isError ? (
          <ErrorState onRetry={() => estado.refetch()} mensagem="Não foi possível carregar. Se a migration 0003 ainda não foi aplicada no Supabase, aplique-a e tente de novo." />
        ) : estado.isPending ? (
          <div className="space-y-3" aria-busy="true"><div className="shimmer h-40 rounded-xl border-2 border-preto" /><div className="shimmer h-64 rounded-xl border-2 border-preto" /></div>
        ) : (
          <Painel key={estado.data.licenca.atualizado_em} m={estado.data} />
        )}
      </main>
    </div>
  )
}

export default function MasterApp() {
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])
  return (
    <AuthProvider>
      <Routes>
        <Route path="login" element={<AdminLogin destino="/master" titulo="Painel do sistema" />} />
        <Route index element={<Guard />} />
        <Route path="*" element={<Navigate to="/master" replace />} />
      </Routes>
    </AuthProvider>
  )
}
