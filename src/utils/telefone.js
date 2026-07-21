// Máscara de telefone (34) 99999-9999 — formata para exibição, não limpa.
export const mascararTelefone = (valor) => {
  const nums = valor.replace(/\D/g, '').slice(0, 11)
  if (nums.length <= 10) {
    return nums.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').replace(/-$/, '')
  }
  return nums.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').replace(/-$/, '')
}
