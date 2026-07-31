(function(){
  'use strict';
  var copy={
    fa:{title:'سشن‌های مشابه',empty:'هنوز سشن مشابه قابل‌اعتمادی پیدا نشد.',similar:'شباهت',threshold:'آستانه هشدار',notice:'این سشن به سشن {market} در {date} شباهت دارد.',summary:'مشاهده خلاصه فرجام',source:'منبع'},
    ar:{title:'جلسات مشابهة',empty:'لم يتم العثور على جلسة مشابهة موثوقة بعد.',similar:'التشابه',threshold:'حد التنبيه',notice:'هذه الجلسة تشبه جلسة {market} في {date}.',summary:'عرض ملخص المصير',source:'المصدر'},
    en:{title:'Similar sessions',empty:'No reliable similar session has been found yet.',similar:'Similarity',threshold:'Alert threshold',notice:'This session resembles the {market} session on {date}.',summary:'View fate summary',source:'Source'},
    es:{title:'Sesiones similares',empty:'Aún no se encontró una sesión similar fiable.',similar:'Similitud',threshold:'Umbral de alerta',notice:'Esta sesión se parece a la sesión de {market} del {date}.',summary:'Ver resumen del desenlace',source:'Origen'}
  };
  function language(){var value=String(document.documentElement.lang||'fa').toLowerCase();return copy[value]?value:'en';}
  function t(key,vars){var value=(copy[language()]||copy.en)[key]||key;Object.keys(vars||{}).forEach(function(name){value=value.replaceAll('{'+name+'}',vars[name]);});return value;}
  window.TradeJournalSessionSignatureI18n={t:t,language:language,direction:function(){return language()==='fa'||language()==='ar'?'rtl':'ltr';}};
}());
