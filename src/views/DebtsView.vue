<template>
  <div id="view-debt" :class="['view', { active }]">
    <div class="section-hero debts-hero">
      <div>
        <div class="section-eyebrow" data-i18n="debts_eyebrow">Nazorat</div>
        <h2 data-i18n="debts_title">Qarzlar</h2>
        <p data-i18n="debts_sub">Kimdan olishingiz va kimga berishingiz kerakligini bir joyda ko'ring.</p>
      </div>
      <button class="hero-pill" type="button" onclick="openDebtForm()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
        <span data-i18n="debts_add_action">Yangi qarz</span>
      </button>
    </div>

    <div class="split-stat-grid">
      <div class="split-stat-card positive">
        <div class="split-stat-top">
          <span class="split-dot"></span>
          <span data-i18n="debts_receivable">Olinadigan</span>
        </div>
        <strong id="debt-receivable-total">0 so'm</strong>
        <small data-i18n="debts_receivable_sub">Sizga qaytishi kerak bo'lgan summa</small>
      </div>
      <div class="split-stat-card warning">
        <div class="split-stat-top">
          <span class="split-dot"></span>
          <span data-i18n="debts_payable">Beriladigan</span>
        </div>
        <strong id="debt-payable-total">0 so'm</strong>
        <small data-i18n="debts_payable_sub">Siz to'lashingiz kerak bo'lgan summa</small>
      </div>
    </div>

    <div class="panel route-panel">
      <div class="panel-ttl" data-i18n="debts_list_title">Qarzlar ro'yxati</div>
      <div id="debt-list" class="route-list"></div>
      <div id="debt-empty" class="empty-route-state">
        <div class="empty-route-ico">🤝</div>
        <h3 data-i18n="debts_empty">Hozircha qarz yozuvlari yo'q</h3>
        <p data-i18n="debts_empty_sub">Keyingi bosqichda shu bo'limga qo'shish, qaytarish va eslatma logikasini bog'laymiz.</p>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  active: { type: Boolean, default: false }
})
</script>
