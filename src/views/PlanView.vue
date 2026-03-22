<template>
  <div id="view-plan" :class="['view', { active }]">
    <div class="section-hero plan-hero">
      <div>
        <div class="section-eyebrow" data-i18n="plan_eyebrow">Rejalashtirish</div>
        <h2 data-i18n="plan_title">Reja</h2>
        <p data-i18n="plan_sub">Oylik sarf va maqsad summalarini oldindan tuzib, limitlar bilan bog'lang.</p>
      </div>
      <button class="hero-pill" type="button" onclick="openPlanForm()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
        <span data-i18n="plan_add_action">Yangi reja</span>
      </button>
    </div>

    <div class="roadmap-grid">
      <div class="roadmap-card">
        <div class="roadmap-step">01</div>
        <div>
          <strong data-i18n="plan_step_budget">Budjet limiti</strong>
          <p data-i18n="plan_step_budget_sub">Kategoriya bo'yicha oy yakunigacha qancha sarflanishini belgilang.</p>
        </div>
      </div>
      <div class="roadmap-card">
        <div class="roadmap-step">02</div>
        <div>
          <strong data-i18n="plan_step_alert">Ogohlantirish</strong>
          <p data-i18n="plan_step_alert_sub">Limit tugashidan oldin mini app va botdan xabar oling.</p>
        </div>
      </div>
      <div class="roadmap-card">
        <div class="roadmap-step">03</div>
        <div>
          <strong data-i18n="plan_step_ai">AI tavsiya</strong>
          <p data-i18n="plan_step_ai_sub">Kategoriyalar va odatlar asosida kelasi xarajatlar uchun tavsiya oling.</p>
        </div>
      </div>
    </div>

    <div class="panel route-panel">
      <div class="panel-ttl" data-i18n="plan_current_title">Joriy reja</div>
      <div id="plan-list" class="route-list"></div>
      <div id="plan-empty" class="empty-route-state compact">
        <div class="empty-route-ico">🎯</div>
        <h3 data-i18n="plan_empty">Hali reja tuzilmagan</h3>
        <p data-i18n="plan_empty_sub">Bu bo'limni keyingi bosqichda kategoriya limitlari va AI tavsiyalar bilan to'ldiramiz.</p>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  active: { type: Boolean, default: false }
})
</script>
