import { Eye, EyeOff } from 'lucide-react'
import { useState, type InputHTMLAttributes } from 'react'

/** Input de senha com botão de olho para mostrar/ocultar o texto digitado. */
export function CampoSenha({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const [visivel, setVisivel] = useState(false)

  return (
    <div className="relative">
      <input {...props} type={visivel ? 'text' : 'password'} className={`${className ?? ''} pr-11`} />
      <button
        type="button"
        onClick={() => setVisivel((v) => !v)}
        aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
        aria-pressed={visivel}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-preto/60 hover:text-preto"
      >
        {visivel ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
      </button>
    </div>
  )
}
