import './style.css'

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <div class="shell">
    <h1>Симулятор аквариумиста</h1>
    <p>Инфраструктура настроена. Запущена заглушка Этапа 0.</p>
    <p class="muted">Следующий шаг — Этап 1: MVP-ядро (каталог рыб, аквариум, экономика).</p>
  </div>
`
