import { useMemo, useState } from "react";
import scenarios from "./data/scenarios.json";
import roster from "./data/roster.json";
import purge from "./data/purge.json";

type Row = { id: string; title: string; pass: boolean; expected: string; actual: string; evidence: string };
const rows = scenarios as Row[];

const tabs = ["Durum", "Döngü", "Sözlük", "Formül", "Laboratuvar", "Kullanım", "Senaryolar", "Bulgular"] as const;

export default function App() {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Durum");
  const [q, setQ] = useState("");
  const passed = rows.filter((r) => r.pass).length;
  const failed = rows.filter((r) => !r.pass);
  const shown = useMemo(
    () => rows.filter((r) => (r.id + r.title + r.actual).toLocaleLowerCase("tr").includes(q.toLocaleLowerCase("tr"))),
    [q]
  );

  return (
    <>
      <header>
        <h1>DHR Performans</h1>
        <p>
          dhrtest2 üzerindeki performans modülünün nasıl çalıştığı, kim ne yapar ve laboratuvar testinin sonucu.
          Hakem, ürünün kendi kılavuzu ve puan kırılımıdır.
        </p>
        <div className="meta">
          <span className="pill">Ortam dhrtest2</span>
          <span className="pill">{passed} geçti</span>
          <span className="pill">{failed.length} bulgu</span>
          <span className="pill">{roster.length} çalışan</span>
        </div>
      </header>
      <nav>
        {tabs.map((name) => (
          <button key={name} className={tab === name ? "on" : ""} onClick={() => setTab(name)}>
            {name}
          </button>
        ))}
      </nav>
      <main>
        {tab === "Durum" && <Status passed={passed} failed={failed.length} />}
        {tab === "Döngü" && <Cycle />}
        {tab === "Sözlük" && <Glossary />}
        {tab === "Formül" && <Formula />}
        {tab === "Laboratuvar" && <Labs />}
        {tab === "Kullanım" && <Guide />}
        {tab === "Senaryolar" && (
          <>
            <h2>Senaryo matrisi</h2>
            <input placeholder="Ara" value={q} onChange={(e) => setQ(e.target.value)} />
            <Table rows={shown} />
          </>
        )}
        {tab === "Bulgular" && (
          <>
            <h2>Tutmayanlar</h2>
            <Table rows={failed} />
          </>
        )}
      </main>
    </>
  );
}

function Status({ passed, failed }: { passed: number; failed: number }) {
  const deleted = purge.deleted?.[0]?.body?.totalDeleted;
  return (
    <>
      <h2>Durum</h2>
      <div className="cards">
        <div className="card"><b className="ok">{passed}</b>geçen senaryo</div>
        <div className="card"><b className="bad">{failed}</b>bulgu</div>
        <div className="card"><b>{deleted ?? "—"}</b>silinen eski performans kaydı</div>
        <div className="card"><b>80</b>1–5 ölçeğinde 4 puanın karşılığı</div>
      </div>
      <p className="note">
        Temizlik yalnız performans tablolarını sildi. Çalışan, birim, pozisyon ve bordro duruyor. Yeni kadro
        Performans Test biriminin altında, sicil 7101–7144, posta <code>@perf.com</code>, şifre <code>Perf123!</code>.
      </p>
    </>
  );
}

function Cycle() {
  const steps = [
    ["Dönem kurulumu", "İK tarih, birim, şablon ve potansiyel seçer. Dönem başlayınca şablon sürümleşir."],
    ["Hedef", "Hedef onaylanmadan ölçülmez. Onaydan sonra değişiklik ayrı talep ister."],
    ["Check-in", "İlerleme notu puana girmez. Kanıt olarak durur."],
    ["Öz değerlendirme", "Kör değerlendirme açıksa yönetici öz puanı göremez."],
    ["Yönetici", "Eşik altı puanda yorum zorunlu olabilir. Sonuç açılınca itiraz penceresi gelir."],
    ["Akran ve ast", "Model 90, 180, 270 veya 360 hangisine izin veriyorsa o roller toplanır."],
    ["Kalibrasyon", "Puan, gerekçeyle düzeltilir. Çan eğrisi dağılımı gösterir."],
    ["9 kutu", "Satır performans, sütun potansiyel. Potansiyeli kesinleşmemiş kişi matrise girmez."],
    ["Aksiyon ve PIP", "Terfi, ücret, yedekleme, gelişim, takdir veya PIP. PIP, aksiyon onaylanmadan açılmaz."],
  ];
  return (
    <>
      <h2>Döngü</h2>
      <ol>
        {steps.map(([t, d]) => (
          <li key={t}><b>{t}.</b> {d}</li>
        ))}
      </ol>
    </>
  );
}

function Glossary() {
  const items = [
    ["Birim ağırlıkları 40/30/20/10", "Yeni şablonu doldurur. Skora girmez. Toplam 100 olmak zorunda değildir."],
    ["Şablon ağırlıkları", "Rol ve kategori toplamı 100 olmalıdır. Değilse kayıt reddedilir."],
    ["90 / 180 / 270 / 360", "Yalnız yönetici; öz + yönetici; bunlara akran; tam tur (ast ve İK dahil)."],
    ["Kör değerlendirme", "Açıksa öz ve yönetici paralel puanlar. Kapalıysa önce çalışan, sonra yönetici öz puanı görür."],
    ["Sonucu çalışana göster", "Kapalıysa karne ve itiraz da kapalıdır. İtiraz günü 0’a zorlanır."],
    ["Akran anonim", "Değerlendirilen kişi akranın adını görmez."],
    ["Yorum eşiği", "Bu puanın altı yorumsuz gönderilemez."],
    ["Min / maks akran", "Birim ayarı. Testte 6 akran, üst sınır 5 iken kabul edildi."],
    ["Yetkinlik ölçeği", "Puan 1 ile bu değer arasındadır. Alt birim kendi ayarı yoksa miras alır."],
    ["Beklentiye oranlı", "Yetkinlik puanı pozisyon beklentisine göre ölçeklenir, tavan %100. Beklenti yoksa ham puan."],
    ["Ek görev yetkinliği", "Yedekleme sekmesini açar. Performans skoruna girmez."],
    ["Aksiyon e-postası", "Onay, atama ve hatırlatma postası. Düşük puandan PIP açmaz."],
    ["PIP görünürlüğü", "Varsayılan kapalı. Açıksa çalışan Performansım’da kendi planını ve notunu görür."],
    ["Ara görüşme", "Puan üretmez."],
    ["Kariyer beyanı", "Potansiyel skorunu değiştirmez."],
    ["Dönem dışı hedef", "Ağırlık %0 kaydolur."],
  ];
  return (
    <>
      <h2>Sözlük</h2>
      {items.map(([t, d]) => (
        <p key={t}><b>{t}.</b> {d}</p>
      ))}
    </>
  );
}

function Formula() {
  return (
    <>
      <h2>Formül</h2>
      <p>Ürün kılavuzundaki hesap:</p>
      <p><code>Final = Σ kategori (kategori ağırlığı × Σ katman (katman ağırlığı × o katmanın kategori puanı))</code></p>
      <ul>
        <li>Puanlanmamış kategori sıfır sayılmaz, formülden çıkar.</li>
        <li>Puanlanmamış katman düşer. Kalan ağırlıklar oran korunarak yeniden hesaplanır.</li>
        <li>Yönetici override doluysa ve gerekçe varsa efektif skor odur.</li>
        <li>Açık uç ve dosya kanıtı puana dönmez.</li>
      </ul>
      <p className="note">
        Laboratuvar ölçümü: 90° şablonda, tek kriter, yönetici puanı 4 (ölçek 1–5). Kırılımdaki genel skor 80.
        Yani ölçek puanı 0–100 bandına <code>puan / 5 × 100</code> ile taşınıyor. Ağırlıklar 100 olduğu için final de 80.
      </p>
      <p>
        KPI’nin doğru orantı, ters orantı ve eşik aritmetiği arayüzde yazılı değil. Üç tip hedef oluşturuldu ve
        gerçekleşen değer güncellendi. Sayısal formül, kırılım notu skordan ayrışırsa bulgu sayılır.
      </p>
    </>
  );
}

function Labs() {
  const units = [
    ["Perf Miras", "Kendi ayarı yok, üst birimden alır. Aylık dönem, 90° şablon."],
    ["Perf 360", "Sonuç gizli, kör, anonim akran, yorum eşiği 7. Yıllık dönem."],
    ["Perf KPI", "Polivalans açık, sonuç açık, çeyrek dönem. KPI ve OKR burada."],
    ["Perf 9Box", "Potansiyel açık, kalibrasyon, altı aylık dönem. Eşikler 45/75 ve 2/4."],
    ["Perf PIP", "Çalışan PIP’ini görür, özel tarih aralığı, 270° şablon."],
  ];
  return (
    <>
      <h2>Laboratuvar</h2>
      {units.map(([n, d]) => <p key={n}><b>{n}.</b> {d}</p>)}
      <h3>Girişler</h3>
      <p>Şifre hepsi için Perf123!</p>
      <table>
        <thead><tr><th>Sicil</th><th>Ad</th><th>Posta</th><th>Birim</th><th>Rol</th></tr></thead>
        <tbody>
          {roster.map((p) => (
            <tr key={p.sicil}>
              <td>{p.sicil}</td><td>{p.name}</td><td>{p.email}</td><td>{p.unit}</td><td>{p.title}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Guide() {
  return (
    <>
      <h2>Kullanım</h2>
      <p><b>İK.</b> Performans Yönetimi ekranında dönemi açar, aşamayı ilerletir, şablonu ve yetkinlik kütüphanesini yönetir, itirazı sonuçlandırır, trendi okur. Birim ayarları Organizasyon Birimi ekranının Performans Ayarları sekmesindedir.</p>
      <p><b>Yönetici.</b> Ekibinin hedefini onaylar, check-in yazar, puanlar, PIP açar, kendi ekibinin 9 kutusunu görür. Başka ekibin kaydını onaylayamaz.</p>
      <p><b>Çalışan.</b> Performansım ekranında hedefini, öz değerlendirmesini ve, ayar açıksa, PIP notunu görür. Sonuç kapalıysa karne gelmez. İK özetine giremez.</p>
      <p><b>Akran ve ast.</b> Atanan Değerlendirmeler sekmesinden formu doldurur. Anonimde adı karşı tarafa açılmaz.</p>
      <p><b>Komite.</b> Kalibrasyon oturumunda kutuyu gerekçeyle taşır. Oturum kapanınca yeni taşıma olmaz.</p>
    </>
  );
}

function Table({ rows: list }: { rows: Row[] }) {
  return (
    <table>
      <thead><tr><th>Kod</th><th>Senaryo</th><th></th><th>Sonuç</th></tr></thead>
      <tbody>
        {list.map((r) => (
          <tr key={r.id}>
            <td>{r.id}</td>
            <td>{r.title}</td>
            <td className={r.pass ? "pass" : "fail"}>{r.pass ? "Geçti" : "Kaldı"}</td>
            <td>{r.actual}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
