import { useMemo, useState } from "react";
import scenarios from "./data/scenarios.json";
import roster from "./data/roster.json";
import purge from "./data/purge.json";

type Row = { id: string; title: string; pass: boolean; expected: string; actual: string; evidence: string };
const rows = scenarios as Row[];

const tabs = ["Özet", "Nasıl işler", "Sözlük", "Puan hesabı", "Kim nerede", "Senaryolar", "Bulgular"] as const;

const groups: { id: string; title: string }[] = [
  { id: "AYAR", title: "Birim ayarları" },
  { id: "SABLON", title: "Şablon" },
  { id: "DONEM", title: "Dönem" },
  { id: "HEDEF", title: "Hedef, KPI ve OKR" },
  { id: "FORM", title: "Değerlendirme formu" },
  { id: "PUAN", title: "Puan" },
  { id: "360", title: "360 derece" },
  { id: "KUTU", title: "9 kutu" },
  { id: "KAL", title: "Kalibrasyon" },
  { id: "ITIRAZ", title: "İtiraz" },
  { id: "AKS", title: "Yetenek aksiyonu" },
  { id: "PIP", title: "PIP" },
  { id: "YETKIN", title: "Yetkinlik" },
  { id: "YETKI", title: "Kim neyi görebilir" },
  { id: "UI", title: "Ekran" },
  { id: "ANALIZ", title: "Raporlar" },
  { id: "ORG", title: "Kadro" },
  { id: "ARA", title: "Ara görüşme" },
  { id: "EK", title: "Ek görev" },
];

const unitName: Record<string, string> = {
  p360: "Perf 360",
  kpi: "Perf KPI",
  box: "Perf 9Box",
  pip: "Perf PIP",
  miras: "Perf Miras",
  parent: "Performans Test",
};

const roleName: Record<string, string> = {
  director: "Müdür",
  lead: "Takım lideri",
  ic: "Uzman",
  peer: "Akran havuzu",
  joiner: "Yeni giren",
  excluded: "Kapsam dışı",
  coach: "Laboratuvar direktörü",
};

const findings: Record<string, { what: string; why: string }> = {
  "PRF-SABLON-12": {
    what: "Sistemin kendi hesapladığı KPI bölümünde puan yazacak kimse kalmıyor.",
    why: "Dönem bu bölümle açılmıyor. Yönetici puanlayacak şekilde değiştirince açıldı.",
  },
  "PRF-KPI-SYS": {
    what: "Aynı engel ayrı bir kasım döneminde de çıktı.",
    why: "Sistem hesabı KPI, dönem başlatmayı durduruyor.",
  },
  "PRF-360-02": {
    what: "En fazla 5 akran yazmasına rağmen 6 akran kaydedildi.",
    why: "Üst sınır kayıtta uygulanmıyor.",
  },
  "PRF-360-03": {
    what: "En az 2 akran gerekirken 1 akran da kaydedildi.",
    why: "Alt sınır da uygulanmıyor.",
  },
  "PRF-FORM-07": {
    what: "Eşik 7 iken yorumsuz 2 puan kabul edildi.",
    why: "Yorum zorunluluğu gönderimde durdurmuyor.",
  },
  "PRF-KAL-05": {
    what: "Kalibrasyonda puan 55 yazıldı. Genel skor 20 kaldı.",
    why: "Düzeltme kayda geçiyor, çalışanın skoruna işlemiyor.",
  },
  "PRF-YETKI-05": {
    what: "Sonuç kapalı göründüğü halde çalışanın servisi genel skoru 92,22 döndürdü.",
    why: "Ekran gizlese de puan cevapta duruyor.",
  },
  "PRF-360-10": {
    what: "Anonim denmesine rağmen akranın adı çalışanın cevabında var.",
    why: "Kimlik gizlenmiyor.",
  },
  "PRF-AYAR-04": {
    what: "Sonuç kapatılınca itiraz günü 0 olmalıydı. 7 kaldı.",
    why: "Ayar metni ile kayıt uyuşmuyor. İtiraz butonu yine de kapalı kaldı.",
  },
  "PRF-DONEM-YENI": {
    what: "Yeni girenler dahil ve hariç seçenekleri aynı 14 kişiyi verdi.",
    why: "Bayrak kapsam listesini değiştirmiyor.",
  },
  "PRF-KUTU-03": {
    what: "Potansiyeli yalnız puanı giren İK kaydedebiliyor. Aynı kişi kendi kaydını kesinleştiremiyor. Başka yetkililer 403 alıyor.",
    why: "9 kutu bu yüzden boş kaldı. Kimse potansiyeli hem giremiyor hem de başkası adına kapatamıyor.",
  },
  "PRF-KUTU-11": {
    what: "Matrisin dokuz hücresi de boş.",
    why: "Potansiyel kesinleşmediği için kimse kutuya yerleşmedi.",
  },
  "PRF-360-09": {
    what: "İK değerlendirici eklendi ama İletişim bölümü bu role puan yazdırmadı.",
    why: "Bölümün puanlayıcı listesinde İK yok.",
  },
  "PRF-HEDEF-24": {
    what: "Hedef değişiklik talebini ne yönetici ne laboratuvar direktörü karara bağlayabildi.",
    why: "İkisi de 403 aldı. Talebi açan İK de kendi talebini kapatamıyor.",
  },
};

function groupOf(id: string) {
  const key = id.split("-")[1] || "";
  return groups.find((g) => g.id === key)?.title || "Diğer";
}

function readable(actual: string) {
  const text = actual.trim();
  if (!text) return "Kayıt var, kısa sonuç yazılmamış.";
  if (text === "ok" || text === "kaydedildi") return "Oldu.";
  if (text.startsWith("{") || text.startsWith("[")) return "Sistem cevap verdi. Ayrıntı teknik kayıtta.";
  if (text.length > 180) return text.slice(0, 180) + "…";
  return text;
}

export default function App() {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Özet");
  const passed = rows.filter((r) => r.pass).length;
  const failed = rows.filter((r) => !r.pass);

  return (
    <>
      <header>
        <div className="wrap">
          <h1>DHR’de performans nasıl işler?</h1>
          <p>
            Bir çalışanın hedefi, puanı, 9 kutusu ve iyileştirme planı hangi sırayla oluşur;
            testte ne tuttu, ne tutmadı.
          </p>
          <div className="meta">
            <span className="pill">dhrtest2</span>
            <span className="pill">{passed} senaryo geçti</span>
            <span className="pill">{failed.length} sorun</span>
            <span className="pill">{roster.length} deneme çalışanı</span>
          </div>
        </div>
      </header>
      <nav>
        <div className="wrap" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {tabs.map((name) => (
            <button key={name} className={tab === name ? "on" : ""} onClick={() => setTab(name)}>
              {name}
            </button>
          ))}
        </div>
      </nav>
      <main>
        <div className="wrap">
          {tab === "Özet" && <Summary passed={passed} failed={failed} />}
          {tab === "Nasıl işler" && <Cycle />}
          {tab === "Sözlük" && <Glossary />}
          {tab === "Puan hesabı" && <Formula />}
          {tab === "Kim nerede" && <People />}
          {tab === "Senaryolar" && <Scenarios />}
          {tab === "Bulgular" && <Findings rows={failed} />}
        </div>
      </main>
    </>
  );
}

function Summary({ passed, failed }: { passed: number; failed: Row[] }) {
  const deleted = purge.deleted?.[0]?.body?.totalDeleted;
  return (
    <>
      <h2>Kısa sonuç</h2>
      <p className="lead">
        Modül bir yıl boyunca hedef, değerlendirme, kalibrasyon ve gelişim planını aynı dönem içinde tutuyor.
        Puan, şablondaki ağırlıklardan çıkıyor. Birim ayarlarındaki 40 / 30 / 20 / 10 yalnız yeni şablonu doldurur, skora girmez.
      </p>
      <div className="cards">
        <div className="card"><b className="ok">{passed}</b><span>Geçen senaryo</span></div>
        <div className="card"><b className="bad">{failed.length}</b><span>Açık sorun</span></div>
        <div className="card"><b>{deleted ?? "—"}</b><span>Silinen eski performans kaydı</span></div>
        <div className="card"><b>80</b><span>5 üzerinden 4 puanın karşılığı</span></div>
      </div>
      <div className="note">
        <b>Hesaba girmek.</b> Sicil 7101–7144, posta <code>adsoyad@perf.com</code>, şifre <code>Perf123!</code>.
        Çalışan ve bordro kayıtları silinmedi. Yalnız eski performans dönemleri, formlar ve puanlar temizlendi.
      </div>
      <h3>Önce buraya bakın</h3>
      <div className="grid">
        <article className="item"><b>Puan.</b> Yönetici 5 üzerinden 4 verdi. Sistem bunu 80 olarak yazdı.</article>
        <article className="item"><b>Gizlilik.</b> Sonuç çalışana kapalıysa karne de itiraz da kapalı.</article>
        <article className="item"><b>9 kutu.</b> Satır performans, sütun potansiyel. Potansiyeli bitmemiş kişi kutuya girmez.</article>
        <article className="item"><b>Açık kalanlar.</b> Akran sınırı, yorum zorunluluğu, gizli skor ve 9 kutunun kesinleşmesi ürün kuralına uymadı. Ayrıntı Bulgular sekmesinde.</article>
      </div>
    </>
  );
}

function Cycle() {
  const steps = [
    ["Dönemi açın", "İK tarih aralığını, birimi ve şablonu seçer. Dönem başlayınca şablon kilitlenir. Sonradan şablonu değiştirmek o dönemin kuralını değiştirmez."],
    ["Hedefi yazın", "Çalışan veya yönetici hedefi yazar. Yönetici onaylamadan hedef ölçülmez. Onaydan sonra değişiklik ayrı bir taleple olur."],
    ["Ara not düşün", "Yıl içinde check-in ve ara görüşme yazılır. Bunlar kanıttır, puana eklenmez."],
    ["Öz değerlendirme", "Çalışan kendini puanlar. Kör değerlendirme açıksa yönetici bu puanı göremez."],
    ["Yönetici puanı", "Eşik altındaki puana yorum yazmak zorunlu olabilir. Sonuç çalışana açılınca itiraz süresi başlar."],
    ["Akran ve ast", "Şablon 90 ise yalnız yönetici vardır. 180 öz + yönetici, 270 buna akranı ekler, 360 ast ve İK’yi de alır."],
    ["Kalibrasyon", "Yöneticiler aynı sıkılıkta puanlamamış olabilir. Komite puanı gerekçeyle düzeltir."],
    ["9 kutu", "Yüksek performans ile yüksek potansiyel aynı şey değildir. İkisi ayrı eksendir."],
    ["Gelişim", "Sonuca göre terfi, ücret, yedekleme, takdir, gelişim veya PIP açılır."],
  ];
  return (
    <>
      <h2>Bir dönem nasıl yürür?</h2>
      <p className="lead">Sıra ürünün kendi kılavuzundaki akıştır. Her adımın kendi tarihi vardır.</p>
      <div className="grid">
        {steps.map(([title, text], i) => (
          <article className="step" key={title}>
            <div className="num">{i + 1}</div>
            <div><b>{title}</b><div>{text}</div></div>
          </article>
        ))}
      </div>
      <h3>Kim ne yapar?</h3>
      <div className="grid">
        <article className="item"><b>İK.</b> Dönemi, şablonu ve yetkinlik kütüphanesini kurar. İtirazı kapatır. Trendleri okur. Birim ayarı, organizasyon biriminin Performans Ayarları sekmesindedir.</article>
        <article className="item"><b>Yönetici.</b> Kendi ekibinin hedefini onaylar, puanlar, PIP açmak ister. Başka ekibin kaydını onaylayamaz.</article>
        <article className="item"><b>Çalışan.</b> Performansım ekranında hedefini ve formunu görür. Sonuç kapalıysa karne gelmez. İK raporuna giremez.</article>
        <article className="item"><b>Akran.</b> Kendisine atanan formu doldurur. Anonim seçildiyse adı karşı tarafa açılmaz.</article>
      </div>
    </>
  );
}

function Glossary() {
  const items = [
    ["Şablon", "Puanın iskeleti. Hangi bölüm var, her bölümün ağırlığı ne, kim puanlıyor."],
    ["Birim ayarı", "Yeni şablonun ilk halini doldurur. 40 / 30 / 20 / 10 skora kendiliğinden girmez."],
    ["90, 180, 270, 360", "Değerlendirmeye kimlerin gireceği. 90 yalnız yönetici, 360 herkes."],
    ["Kör değerlendirme", "Açıksa çalışan ve yönetici aynı anda puanlar, yönetici öz puanı görmez. Kapalıysa önce çalışan biter."],
    ["Sonucu göster", "Kapalıysa çalışan karnesini görmez ve itiraz edemez."],
    ["Yorum eşiği", "Bu puanın altında yorum boş bırakılamaz."],
    ["Akran sayısı", "En az ve en çok kaç akran atanacağı. Üst sınırın kaydı durdurmadığı görüldü."],
    ["Yetkinlik ölçeği", "Yetkinlik puanı 1 ile bu sayı arasındadır. Alt birim kendi ayarını yazmadıysa üst birimden alır."],
    ["Beklentiye oranlı", "Yetkinlik, pozisyondan beklenen seviyeye göre ölçeklenir. Beklenti yoksa ham puan kullanılır."],
    ["Ek görev", "Asıl işin yanındaki rol. Skora girmez, yedekleme listesinde durur."],
    ["Aksiyon e-postası", "Onay ve hatırlatma maili gönderir. Düşük puandan kendiliğinden PIP açmaz."],
    ["PIP", "Performans iyileştirme planı. Hedef, tarih ve ara kontrol vardır. Çalışan ancak ayar açıksa kendi planını görür."],
    ["9 kutu", "Performans ve potansiyeli yan yana koyan tablo. Dokuz hücre vardır."],
    ["Kalibrasyon", "Ham puanı komitenin gerekçeli puanından ayıran oturum."],
    ["Ara görüşme", "Dönem ortası konuşma kaydı. Puan üretmez."],
    ["Dönem dışı hedef", "Takip için durur, ağırlığı sıfır yazılır, dönemin puanına girmez."],
  ];
  return (
    <>
      <h2>Kelimeler</h2>
      <p className="lead">Ekranda görünen ayarın ne işe yaradığı.</p>
      <div className="grid">
        {items.map(([title, text]) => (
          <article className="item" key={title}><b>{title}.</b> {text}</article>
        ))}
      </div>
    </>
  );
}

function Formula() {
  return (
    <>
      <h2>Puan nasıl çıkar?</h2>
      <p className="lead">
        Önce her bölümün puanı hesaplanır. Sonra bölümler kendi ağırlıklarıyla toplanır.
        Bölümü puanlayan kişi yoksa o kişi düşer, kalanların oranı korunur. Hiç puanlanmamış bölüm sıfır sayılmaz, hesaptan çıkar.
      </p>
      <div className="example">
        <div className="kicker">Laboratuvarda ölçülen örnek</div>
        <p>
          Şablon 90 derece: yalnız yönetici, ağırlığı %100. Tek soru, ölçek 1–5. Yönetici <b>4</b> yazdı.
        </p>
        <p>4 ÷ 5 = 0,80. Bunun 100 karşılığı <b>80</b>.</p>
        <p>Kırılım ekranındaki genel skor da 80. Ağırlıklar zaten %100 olduğu için başka bir çarpan yok.</p>
      </div>
      <ul>
        <li>Yönetici gerekçeli bir düzeltme yazdıysa, hesaplanan puan değil o düzeltme geçerlidir.</li>
        <li>Açık uçlu soru ve dosya kanıtı puana dönmez.</li>
        <li>KPI üç türlü olabilir: arttıkça iyi, azaldıkça iyi, eşiği geçti ya da geçmedi. Bu üçünün iç hesabı ekranda yazmıyor. Kırılım notu ile saklanan skor ayrışırsa sorun sayılır.</li>
      </ul>
    </>
  );
}

function People() {
  const units = ["p360", "kpi", "box", "pip", "miras"];
  return (
    <>
      <h2>Deneme kadrosu</h2>
      <p className="lead">
        Beş birim, birbirinin ayarını bozmasın diye ayrıldı. Hepsinin şifresi <b>Perf123!</b>
      </p>
      <div className="grid">
        <article className="item"><b>Perf Miras.</b> Kendi ayarı yok, üst birimden alır. Aylık dönem. Yalnız yönetici puanlar.</article>
        <article className="item"><b>Perf 360.</b> Sonuç gizli, kör ve anonim. Yorum eşiği 7. Yıllık dönem.</article>
        <article className="item"><b>Perf KPI.</b> Sonuç açık. Çeyrek dönem. Hedef, KPI ve OKR burada.</article>
        <article className="item"><b>Perf 9Box.</b> Potansiyel ve kalibrasyon açık. Altı aylık dönem.</article>
        <article className="item"><b>Perf PIP.</b> Çalışan kendi iyileştirme planını görebilir. Özel tarih aralığı.</article>
      </div>
      {units.map((unit) => (
        <section key={unit}>
          <h3>{unitName[unit]}</h3>
          <div className="people">
            {roster.filter((p) => p.unit === unit).map((p) => (
              <article className="person" key={p.sicil}>
                <b>{p.sicil}</b>
                <div>
                  {p.name} · {roleName[p.kind] || p.title}
                  <div className="muted">{p.email}</div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function Scenarios() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "pass" | "fail">("all");
  const shown = useMemo(() => {
    const query = q.toLocaleLowerCase("tr");
    return rows.filter((r) => {
      if (filter === "pass" && !r.pass) return false;
      if (filter === "fail" && r.pass) return false;
      const blob = (r.id + r.title + r.actual + groupOf(r.id)).toLocaleLowerCase("tr");
      return blob.includes(query);
    });
  }, [q, filter]);
  const buckets = groups
    .map((g) => ({ ...g, rows: shown.filter((r) => groupOf(r.id) === g.title) }))
    .filter((g) => g.rows.length);

  return (
    <>
      <h2>Ne denendi?</h2>
      <p className="lead">Her satır bir davranış. Geçti, ürün kendi kuralına uydu demektir.</p>
      <input placeholder="Hedef, itiraz, 9 kutu…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="filters">
        <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>Tümü ({rows.length})</button>
        <button className={filter === "pass" ? "on" : ""} onClick={() => setFilter("pass")}>Geçenler</button>
        <button className={filter === "fail" ? "on" : ""} onClick={() => setFilter("fail")}>Kalanlar</button>
      </div>
      {buckets.map((bucket) => (
        <section key={bucket.id}>
          <h3>{bucket.title}</h3>
          <div className="grid">
            {bucket.rows.map((r) => <Scenario key={r.id} row={r} />)}
          </div>
        </section>
      ))}
    </>
  );
}

function Scenario({ row }: { row: Row }) {
  const detail = [row.expected, row.actual, row.evidence].filter(Boolean).join("\n\n");
  const long = row.actual.length > 80 || row.actual.includes("{");
  return (
    <article className="item">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <b>{row.title}</b>
        <span className={row.pass ? "badge pass" : "badge fail"}>{row.pass ? "Geçti" : "Kaldı"}</span>
      </div>
      <div className="muted">{readable(row.actual)}</div>
      {long && (
        <details>
          <summary>Teknik kayıt</summary>
          <pre>{detail}</pre>
        </details>
      )}
    </article>
  );
}

function Findings({ rows: failed }: { rows: Row[] }) {
  return (
    <>
      <h2>Tutmayanlar</h2>
      <p className="lead">{failed.length} kayıt ürünün kendi kuralına uymadı. Diğer senaryolar geçti.</p>
      <div className="grid">
        {failed.map((row) => {
          const text = findings[row.id];
          return (
            <article className="finding" key={row.id}>
              <div className="kicker">{row.id}</div>
              <h3 style={{ marginTop: 4 }}>{row.title}</h3>
              <p><b>Ne oldu.</b> {text?.what || readable(row.actual)}</p>
              {text && <p><b>Neden önemli.</b> {text.why}</p>}
            </article>
          );
        })}
      </div>
    </>
  );
}
