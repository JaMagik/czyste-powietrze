import React, { useState } from 'react';
import { jsPDF } from "jspdf";


/*
 * Data definitions based on publicly available information about the
 * Czyste Powietrze programme.  Each item defines a maximum amount
 * (for the highest 100 % funding tier) and a default VAT rate.  When
 * calculating funding for the lower tiers (70 % or 40 %), the
 * maximum grant per unit is scaled accordingly.  If the unit price
 * entered by the user is lower than the calculated grant, the grant
 * will never exceed the actual net cost.
 */
const documentationItems = [
  // VAT rates are stored as percentages (e.g. 8 means 8 %).  They are
  // converted to decimal form during calculations.
  { id: 'audit', name: 'Audyt energetyczny', unit: 'szt', max100: 1200.0, vat: 8 },
  { id: 'certificate', name: 'Świadectwo charakterystyki energetycznej', unit: 'szt', max100: 400.0, vat: 8 }
];

const heatItems = [
  { id: 'district', name: 'Podłączenie do sieci ciepłowniczej (z węzłem cieplnym)', unit: 'szt', max100: 22250.0, vat: 8 },
  { id: 'air_water_pump', name: 'Pompa ciepła powietrze/woda', unit: 'szt', max100: 31500.0, vat: 8 },
  { id: 'air_water_pump_high', name: 'Pompa ciepła powietrze/woda (wyższa klasa efektywności)', unit: 'szt', max100: 37500.0, vat: 8 },
  { id: 'air_air_pump', name: 'Pompa ciepła powietrze/powietrze', unit: 'szt', max100: 11200.0, vat: 8 },
  { id: 'ground_pump_high', name: 'Gruntowa pompa ciepła (wysoka klasa efektywności)', unit: 'szt', max100: 45000.0, vat: 8 },
  { id: 'ground_source', name: 'Dolne źródło gruntowej pompy ciepła', unit: 'szt', max100: 21500.0, vat: 8 },
  { id: 'wood_gas_boiler', name: 'Kocioł zgazowujący drewno (podwyższony standard)', unit: 'szt', max100: 20500.0, vat: 8 },
  { id: 'pellet_boiler', name: 'Kocioł na pellet drzewny (podwyższony standard)', unit: 'szt', max100: 20500.0, vat: 8 },
  { id: 'electric_heating', name: 'Ogrzewanie elektryczne', unit: 'szt', max100: 11200.0, vat: 8 },
  { id: 'central_heating', name: 'Instalacja centralnego ogrzewania + ciepła woda użytkowa', unit: 'szt', max100: 20500.0, vat: 8 }
];

const thermoItems = [
  { id: 'roof_ceiling', name: 'Ocieplenie stropu/dachu', unit: 'm²', max100: 200.0, vat: 8 },
  { id: 'floors', name: 'Ocieplenie podłóg', unit: 'm²', max100: 150.0, vat: 8 },
  { id: 'walls', name: 'Ocieplenie ścian', unit: 'm²', max100: 250.0, vat: 8 },
  // According to official guidelines for 2025, stolarka okienna and
  // stolarka drzwiowa mają maksymalne stawki zależne od poziomu
  // dofinansowania: 480/840/1200 zł per m² for windows and
  // 1 000/1 750/2 500 zł per m² for doors【505836760676266†L310-L320】.  To
  // correctly apply scaling (0.4, 0.7, 1.0) we set max100 to the
  // highest value (1200 for windows and 2500 for doors) and let
  // computeCategory scale it for lower tiers.
  { id: 'windows', name: 'Stolarka okienna', unit: 'm²', max100: 1200.0, vat: 8 },
  { id: 'doors', name: 'Stolarka drzwiowa', unit: 'm²', max100: 2500.0, vat: 8 },
  { id: 'garage_doors', name: 'Bramy garażowe', unit: 'szt', max100: 2500.0, vat: 8 }
];

const ventItems = [
  { id: 'central_rekuperation', name: 'Rekuperacja centralna', unit: 'kpl', max100: 16700.0, vat: 8 },
  { id: 'wall_rekuperator', name: 'Rekuperator ścienny', unit: 'szt', max100: 2000.0, vat: 8 }
];

// A list of energy efficiency categories.  The programme assesses
// building energy demand in broad bands rather than requiring an exact
// figure.  The numeric value associated with each category is used
// solely to decide whether the threshold of 140 kWh/(m²·rok) is
// exceeded for the highest funding level.
const energyOptions = [
  { value: 'low', label: 'do 70 kWh/(m²·rok)', numeric: 70 },
  { value: 'mid', label: '70–120 kWh/(m²·rok)', numeric: 100 },
  { value: 'high', label: '120–140 kWh/(m²·rok)', numeric: 130 },
  { value: 'very_high', label: 'powyżej 140 kWh/(m²·rok)', numeric: 150 }
];

// Income categories for monthly income per person.  Selecting one
// of these options simplifies input and ensures the programme
// thresholds are applied consistently.  The numeric value is a
// representative value within each range.
const incomeOptions = [
  { value: 'low', label: 'do 1 300 zł/os.', numeric: 1300 },
  { value: 'mid', label: '1 301–2 250 zł/os.', numeric: 2000 },
  { value: 'high', label: '2 251–3 150 zł/os.', numeric: 2700 },
  { value: 'above', label: 'powyżej 3 150 zł/os.', numeric: 4000 }
];

// Determine the funding level given household metrics.  The logic
// reflects information published about the programme for 2025:
//  - Highest level (100 %) is available when the average monthly
//    income per person does not exceed 1 300 zł (multi‑person) or
//    1 800 zł (single‑person), energy consumption exceeds 140 kWh/(m²·rok)
//    and the applicant plans a comprehensive thermomodernisation.
//  - Increased level (70 %) is available when average monthly income
//    does not exceed 2 250 zł (multi‑person) or 3 150 zł (single‑person).
//  - Basic level (40 %) is available when the annual household
//    income does not exceed 135 000 zł.
//  - Otherwise, the applicant is not eligible for a grant.
function parseDecimal(value) {
  // Convert a string containing either a comma or dot as a decimal
  // separator into a number.  If parsing fails, return 0.
  if (value === undefined || value === null) return 0;
  const norm = value.toString().replace(',', '.');
  const parsed = parseFloat(norm);
  return isNaN(parsed) ? 0 : parsed;
}



function determineSupportLevel({ income, people, energy, fullThermo }) {
  // Convert input values to numeric form, accepting comma as decimal
  // Convert income which may be a category key into a numeric value.
  let inc;
  if (typeof income === 'string' && incomeOptions.some(opt => opt.value === income)) {
    const opt = incomeOptions.find(opt => opt.value === income);
    inc = opt ? opt.numeric : 0;
  } else {
    inc = parseDecimal(income);
  }
  const ppl = parseInt(people, 10) || 1;
  // If energy is provided as a string label (category key), attempt
  // to find the numeric value; otherwise parse as a number.
  let eu;
  if (typeof energy === 'string' && energyOptions.some(opt => opt.value === energy)) {
    const opt = energyOptions.find(opt => opt.value === energy);
    eu = opt ? opt.numeric : 0;
  } else {
    eu = parseDecimal(energy);
  }
  const comprehensive = fullThermo === 'yes';
  // Highest (100 %)
  if (ppl === 1) {
    if (inc <= 1800 && eu > 140 && comprehensive) {
      return 'highest';
    }
  } else {
    if (inc <= 1300 && eu > 140 && comprehensive) {
      return 'highest';
    }
  }
  // Increased (70 %)
  if (ppl === 1) {
    if (inc <= 3150) {
      return 'increased';
    }
  } else {
    if (inc <= 2250) {
      return 'increased';
    }
  }
  // Basic (40 %)
  const annual = inc * 12 * ppl;
  if (annual <= 135000) {
    return 'basic';
  }
  return 'none';
}

// Compute totals for a category.  The `entries` object holds user
// supplied quantities, prices and VAT rates keyed by item id.  The
// funding factor is determined by the support level.
function computeCategory(items, entries, level) {
  let factor = 0;
  if (level === 'highest') factor = 1.0;
  else if (level === 'increased') factor = 0.7;
  else if (level === 'basic') factor = 0.4;
  else factor = 0.0;

  const rows = [];
  let net = 0;
  let vatSum = 0;
  let grantSum = 0;
  items.forEach(item => {
    const entry = entries[item.id] || {};
    // Parse decimals in a locale‑agnostic manner
    const qty = parseDecimal(entry.quantity);
    const price = parseDecimal(entry.price);
    // Convert VAT input to a decimal fraction.  If the user enters
    // "8" or "23" treat it as a percent; if they enter "0.08" it is
    // already a fraction.  Fallback to the item's default VAT (also
    // stored as percent) when no value is supplied.
    const rawVat = parseDecimal(entry.vat);
    let vatRate;
    if (rawVat) {
      vatRate = rawVat <= 1 ? rawVat : rawVat / 100;
    } else {
      // item.vat is expressed as a percent (e.g. 8 means 8 %)
      const def = parseDecimal(item.vat);
      vatRate = def <= 1 ? def : def / 100;
    }
    if (!qty || !price) {
      return;
    }
    const costNet = qty * price;
    const grantPerUnit = item.max100 * factor;
    const maxGrant = qty * grantPerUnit;
    const grant = Math.min(costNet, maxGrant);
    const vatAmount = costNet * vatRate;
    const gross = costNet + vatAmount;
    const beneficiary = gross - grant;
    rows.push({
      name: item.name,
      quantity: qty,
      costNet,
      vatAmount,
      gross,
      grant,
      beneficiary,
    });
    net += costNet;
    vatSum += vatAmount;
    grantSum += grant;
  });
  const gross = net + vatSum;
  const beneficiaryTotal = gross - grantSum;
  return { rows, net, vat: vatSum, gross, grant: grantSum, beneficiary: beneficiaryTotal };
}

// A helper component to render a table for a given category.  It
// accepts a title and the computed totals object.  If there are no
// rows, nothing is rendered.
function CategoryTable({ title, data }) {
  if (!data || !data.rows || data.rows.length === 0) return null;
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <h3>{title}</h3>
      <table>
        <thead>
          <tr>
            <th>Pozycja</th>
            <th>Ilość</th>
            <th>Koszt netto</th>
            <th>VAT</th>
            <th>Koszt brutto</th>
            <th>Dofinansowanie</th>
            <th>Dopłata beneficjenta</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, idx) => (
            <tr key={idx}>
              <td>{row.name}</td>
              <td>{row.quantity.toFixed(2)}</td>
              <td>{row.costNet.toFixed(2)}</td>
              <td>{row.vatAmount.toFixed(2)}</td>
              <td>{row.gross.toFixed(2)}</td>
              <td>{row.grant.toFixed(2)}</td>
              <td>{row.beneficiary.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function App() {
  // Beneficiary form state
  const [form, setForm] = useState({
    name: '',
    address: '',
    energy: 'low',
    income: 'low',
    people: 1,
    replaceHeat: 'no',
    fullThermo: 'no',
  }
)
 function exportResultsToPDF() {
    if (!results) return;
    const doc = new jsPDF();
    let y = 10;
    doc.setFontSize(16);
    doc.text("Kalkulator programu „Czyste Powietrze 2025”", 10, y);
    y += 10;
    doc.setFontSize(12);
    doc.text(`Beneficjent: ${form.name}, ${form.address}`, 10, y);
    y += 10;
    doc.text(
      `Poziom dofinansowania: ${
        supportLevel === "highest"
          ? "Najwyższy – do 100 % netto"
          : supportLevel === "increased"
          ? "Podwyższony – do 70 %"
          : "Podstawowy – do 40 %"
      }`,
      10,
      y
    );
    y += 10;

    // Dodaj podsumowanie
    doc.text(`Kwota netto inwestycji: ${results.totals.net.toFixed(2)} zł`, 10, y); y += 7;
    doc.text(`VAT: ${results.totals.vat.toFixed(2)} zł`, 10, y); y += 7;
    doc.text(`Kwota brutto inwestycji: ${results.totals.gross.toFixed(2)} zł`, 10, y); y += 7;
    doc.text(`Dofinansowanie: ${results.totals.grant.toFixed(2)} zł`, 10, y); y += 7;
    doc.text(`Kwota dopłaty beneficjenta: ${results.totals.beneficiary.toFixed(2)} zł`, 10, y); y += 10;

    // Dodaj tabele z kategoriami (tylko podsumowanie, uproszczone)
    const addCategory = (title, data) => {
      if (!data || !data.rows || data.rows.length === 0) return;
      doc.setFontSize(12);
      doc.text(title, 10, y); y += 7;
      data.rows.forEach(row => {
        doc.text(
          `${row.name}: ilość ${row.quantity}, netto ${row.costNet.toFixed(2)} zł, VAT ${row.vatAmount.toFixed(2)} zł, brutto ${row.gross.toFixed(2)} zł, dofinansowanie ${row.grant.toFixed(2)} zł, dopłata ${row.beneficiary.toFixed(2)} zł`,
          10,
          y
        );
        y += 7;
        if (y > 280) { doc.addPage(); y = 10; }
      });
      y += 3;
    };

    addCategory("Dokumentacja", results.docs);
    if (form.replaceHeat === 'yes') addCategory("Wymiana źródła ciepła", results.heat);
    if (form.fullThermo === 'yes') {
      addCategory("Prace termomodernizacyjne", results.thermo);
      addCategory("Modernizacja systemu wentylacji", results.vent);
    }

    doc.save("kalkulator_czyste_powietrze.pdf");
  };

  // Entry states for each category.  Objects keyed by item id.
  const initEntries = items => {
    const obj = {};
    items.forEach(item => {
      obj[item.id] = { quantity: '', price: '', vat: item.vat };
    });
    return obj;
  };
  const [docEntries, setDocEntries] = useState(initEntries(documentationItems));
  const [heatEntries, setHeatEntries] = useState(initEntries(heatItems));
  const [thermoEntries, setThermoEntries] = useState(initEntries(thermoItems));
  const [ventEntries, setVentEntries] = useState(initEntries(ventItems));

  const [supportLevel, setSupportLevel] = useState(null);
  const [results, setResults] = useState(null);

  // Generic handler for top level form fields
  const handleFormChange = e => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  // Handlers for entry changes
  const updateEntry = (setter, id, field, value) => {
    setter(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  };

  // Submission handler.  Prevents default form submission, determines
  // eligibility and computes all totals.
  const handleSubmit = e => {
    e.preventDefault();
    // Determine support level
    const level = determineSupportLevel({
      income: form.income,
      people: form.people,
      energy: form.energy,
      fullThermo: form.fullThermo,
    });
    setSupportLevel(level);
    if (level === 'none') {
      setResults(null);
      return;
    }
    // Compute categories
    const docs = computeCategory(documentationItems, docEntries, level);
    const heat = form.replaceHeat === 'yes' ? computeCategory(heatItems, heatEntries, level) : { rows: [], net: 0, vat: 0, gross: 0, grant: 0, beneficiary: 0 };
    const thermo = form.fullThermo === 'yes' ? computeCategory(thermoItems, thermoEntries, level) : { rows: [], net: 0, vat: 0, gross: 0, grant: 0, beneficiary: 0 };
    const vent = form.fullThermo === 'yes' ? computeCategory(ventItems, ventEntries, level) : { rows: [], net: 0, vat: 0, gross: 0, grant: 0, beneficiary: 0 };
    // Aggregate totals
    const totalNet = docs.net + heat.net + thermo.net + vent.net;
    const totalVat = docs.vat + heat.vat + thermo.vat + vent.vat;
    const totalGross = totalNet + totalVat;
    // Sum the grants across all categories
    let totalGrant = docs.grant + heat.grant + thermo.grant + vent.grant;
    /*
     * Apply programme‑wide caps on total grant amounts.  According to
     * publicly available guidelines for Czyste Powietrze 2025, each
     * funding tier has an overall limit on the sum of dotacje:
     *  - Highest (100 %): up to 135 000 zł【117462389732097†L1175-L1178】;
     *  - Increased (70 %): up to 99 000 zł【117462389732097†L560-L575】;
     *  - Basic (40 %): up to 66 000 zł【117462389732097†L560-L569】.
     *  When the computed grant exceeds the limit, cap it at the
     *  appropriate threshold.  This ensures the calculator never
     *  reports a dotacja większą niż dopuszczalna w programie.
     */
    const grantCaps = {
      highest: 135000,
      increased: 99000,
      basic: 66000,
    };
    const cap = grantCaps[level] || 0;
    if (totalGrant > cap) {
      totalGrant = cap;
    }
    const totalBeneficiary = totalGross - totalGrant;
    setResults({
      docs,
      heat,
      thermo,
      vent,
      totals: {
        net: totalNet,
        vat: totalVat,
        gross: totalGross,
        grant: totalGrant,
        beneficiary: totalBeneficiary,
      },
    });
  };

  // Render top level
  return (
    <div className="container">
      <h1>Kalkulator programu „Czyste Powietrze 2025”</h1>
      <p>
        Ten kalkulator pozwala oszacować maksymalne dofinansowanie w ramach
        programu Czyste Powietrze na podstawie podstawowych danych o
        beneficjencie, stopniu zużycia energii oraz planowanym zakresie
        prac.  Poziom dofinansowania zależy od dochodów, liczby osób w
        gospodarstwie domowym i tego, czy planowana jest kompleksowa
        termomodernizacja.
      </p>
      <form onSubmit={handleSubmit}>
        <fieldset className="beneficiary-form">
          <legend>Dane beneficjenta</legend>
          <label>
            Imię i nazwisko
            <input
              name="name"
              type="text"
              value={form.name}
              onChange={handleFormChange}
              required
            />
          </label>
          <label>
            Adres inwestycji
            <input
              name="address"
              type="text"
              value={form.address}
              onChange={handleFormChange}
              required
            />
          </label>
          <label>
            Efektywność energetyczna budynku (EU)
            <select
              name="energy"
              value={form.energy}
              onChange={handleFormChange}
            >
              {energyOptions.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Miesięczny dochód na osobę
            <select
              name="income"
              value={form.income}
              onChange={handleFormChange}
            >
              {incomeOptions.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Liczba osób w gospodarstwie domowym
            <input
              name="people"
              type="number"
              step="1"
              min="1"
              value={form.people}
              onChange={handleFormChange}
              required
            />
          </label>
          <label>
            Czy wymieniasz źródło ciepła?
            <select
              name="replaceHeat"
              value={form.replaceHeat}
              onChange={handleFormChange}
            >
              <option value="no">Nie</option>
              <option value="yes">Tak</option>
            </select>
          </label>
          <label>
            Czy planujesz kompleksową termomodernizację?
            <select
              name="fullThermo"
              value={form.fullThermo}
              onChange={handleFormChange}
            >
              <option value="no">Nie</option>
              <option value="yes">Tak</option>
            </select>
          </label>
        </fieldset>

        <fieldset>
          <legend>Dokumentacja</legend>
          <table>
            <thead>
              <tr>
                <th>Pozycja</th>
                <th>Ilość</th>
                <th>Cena jedn. netto (zł)</th>
                <th>VAT</th>
              </tr>
            </thead>
            <tbody>
              {documentationItems.map(item => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={docEntries[item.id].quantity}
                      onChange={e =>
                        updateEntry(setDocEntries, item.id, 'quantity', e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={docEntries[item.id].price}
                      onChange={e =>
                        updateEntry(setDocEntries, item.id, 'price', e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <select
                      value={docEntries[item.id].vat}
                      onChange={e =>
                        updateEntry(setDocEntries, item.id, 'vat', e.target.value)
                      }
                    >
                      <option value="8">8 %</option>
                      <option value="23">23 %</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </fieldset>

        {form.replaceHeat === 'yes' && (
          <fieldset>
            <legend>Wymiana źródła ciepła</legend>
            <p>
              Podaj liczbę urządzeń i cenę netto.  VAT dla urządzeń grzewczych przyjęto
              8 %.
            </p>
            <table>
              <thead>
                <tr>
                  <th>Rodzaj urządzenia</th>
                  <th>Ilość</th>
                  <th>Cena jedn. netto (zł)</th>
                  <th>VAT</th>
                </tr>
              </thead>
              <tbody>
                {heatItems.map(item => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={heatEntries[item.id].quantity}
                        onChange={e =>
                          updateEntry(setHeatEntries, item.id, 'quantity', e.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={heatEntries[item.id].price}
                        onChange={e =>
                          updateEntry(setHeatEntries, item.id, 'price', e.target.value)
                        }
                      />
                    </td>
                    <td>
                      <select
                        value={heatEntries[item.id].vat}
                        onChange={e =>
                          updateEntry(setHeatEntries, item.id, 'vat', e.target.value)
                        }
                      >
                        <option value="8">8 %</option>
                        <option value="23">23 %</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </fieldset>
        )}

        {form.fullThermo === 'yes' && (
          <>
            <fieldset>
              <legend>Prace termomodernizacyjne</legend>
              <p>
                Podaj powierzchnię lub liczbę elementów i koszt jednostkowy netto.
                VAT domyślnie 8 %.
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Zakres prac</th>
                    <th>Ilość</th>
                    <th>Cena jedn. netto (zł)</th>
                    <th>VAT</th>
                  </tr>
                </thead>
                <tbody>
                  {thermoItems.map(item => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>
                    <input
                          type="number"
                          min="0"
                          step={item.unit === 'm²' ? '0.01' : '1'}
                          value={thermoEntries[item.id].quantity}
                          onChange={e =>
                            updateEntry(setThermoEntries, item.id, 'quantity', e.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={thermoEntries[item.id].price}
                          onChange={e =>
                            updateEntry(setThermoEntries, item.id, 'price', e.target.value)
                          }
                        />
                      </td>
                      <td>
                        <select
                          value={thermoEntries[item.id].vat}
                          onChange={e =>
                            updateEntry(setThermoEntries, item.id, 'vat', e.target.value)
                          }
                        >
                          <option value="8">8 %</option>
                          <option value="23">23 %</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </fieldset>

            <fieldset>
              <legend>Modernizacja systemu wentylacji</legend>
              <p>Podaj liczbę urządzeń i koszt jednostkowy netto. VAT domyślnie 8 %.</p>
              <table>
                <thead>
                  <tr>
                    <th>Rodzaj urządzenia</th>
                    <th>Ilość</th>
                    <th>Cena jedn. netto (zł)</th>
                    <th>VAT</th>
                  </tr>
                </thead>
                <tbody>
                  {ventItems.map(item => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={ventEntries[item.id].quantity}
                          onChange={e =>
                            updateEntry(setVentEntries, item.id, 'quantity', e.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={ventEntries[item.id].price}
                          onChange={e =>
                            updateEntry(setVentEntries, item.id, 'price', e.target.value)
                          }
                        />
                      </td>
                      <td>
                        <select
                          value={ventEntries[item.id].vat}
                          onChange={e =>
                            updateEntry(setVentEntries, item.id, 'vat', e.target.value)
                          }
                        >
                          <option value="8">8 %</option>
                          <option value="23">23 %</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </fieldset>
          </>
        )}

        <div className="actions">
          <button type="submit">Oblicz</button>
        </div>
      </form>
      {/* Display results */}
      {supportLevel && supportLevel === 'none' && (
        <div className="results">
          <p className="warning">
            Nie spełniasz kryteriów programu – zbyt wysokie dochody lub
            niewystarczająca energochłonność budynku. Dotacja nie
            przysługuje.
          </p>
        </div>
      )}
      {results && supportLevel !== 'none' && (
        <div className="results">
          <p className="beneficiary">
            <strong>Beneficjent:</strong>{' '}
            {form.name && form.address
              ? `${form.name}, ${form.address}`
              : form.name || form.address || ''}
          </p>
          <h2>
            Poziom dofinansowania:{' '}
            {supportLevel === 'highest'
              ? 'Najwyższy – do 100 % netto'
              : supportLevel === 'increased'
              ? 'Podwyższony – do 70 %'
              : 'Podstawowy – do 40 %'}
          </h2>
          <CategoryTable title="Dokumentacja" data={results.docs} />
          {form.replaceHeat === 'yes' && (
            <CategoryTable title="Wymiana źródła ciepła" data={results.heat} />
          )}
          {form.fullThermo === 'yes' && (
            <>
              <CategoryTable title="Prace termomodernizacyjne" data={results.thermo} />
              <CategoryTable title="Modernizacja systemu wentylacji" data={results.vent} />
            </>
          )}
          <h3>Podsumowanie</h3>
          <table>
            <tbody>
              <tr>
                <th>Kwota netto inwestycji</th>
                <td>{results.totals.net.toFixed(2)} zł</td>
              </tr>
              <tr>
                <th>VAT</th>
                <td>{results.totals.vat.toFixed(2)} zł</td>
              </tr>
              <tr>
                <th>Kwota brutto inwestycji</th>
                <td>{results.totals.gross.toFixed(2)} zł</td>
              </tr>
              <tr>
                <th>Dofinansowanie</th>
                <td>{results.totals.grant.toFixed(2)} zł</td>
              </tr>
              <tr>
                <th>Kwota dopłaty beneficjenta</th>
                <td>{results.totals.beneficiary.toFixed(2)} zł</td>
              </tr>
            </tbody>
          </table>
          <div className="actions" style={{ marginTop: '1rem' }}>
            {/* Use window.print() for PDF export.  During print only the
                .results section will be visible thanks to CSS rules. */}
            <button
    type="button"
    className="btn-secondary"
    onClick={exportResultsToPDF}
  >
    Eksportuj do PDF
  </button>
  <button
    type="button"
    className="btn-secondary"
    onClick={() => {
      window.print();
    }}
  >
    Zapisz jako PDF
  </button>
          </div>
        </div>
      )}
    </div>
    
  );
  
  
}