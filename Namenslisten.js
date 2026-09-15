// Abgleich und Pflege der Blätter "Personen" und "Projekte".

function ladeNamenslisteAlsText_(sheet) {
  var letzteZeile = sheet.getLastRow();
  if (letzteZeile < 2) return '';
  var werte = sheet.getRange(2, 1, letzteZeile - 1, 2).getValues();
  var zeilen = [];
  werte.forEach(function (zeile) {
    var name = zeile[0], varianten = zeile[1];
    if (!name) return;
    zeilen.push(varianten ? (name + ': ' + varianten) : name);
  });
  return zeilen.join('; ');
}

/**
 * Gleicht einen von Claude gelieferten Namen mit dem Blatt ab (Name- oder
 * Schreibvarianten-Spalte, ohne Groß-/Kleinschreibung). Bekannt -> kanonischen
 * Namen zurückgeben und "Zuletzt" aktualisieren. Unbekannt -> neue Zeile anlegen.
 * @return {{kanonisch: string, istNeu: boolean}}
 */
function nameAbgleichen_(sheet, name, jetzt) {
  var letzteZeile = sheet.getLastRow();
  var gesucht = name.trim().toLowerCase();

  if (letzteZeile >= 2) {
    var werte = sheet.getRange(2, 1, letzteZeile - 1, 2).getValues();
    for (var i = 0; i < werte.length; i++) {
      var kanonisch = werte[i][0];
      var varianten = (werte[i][1] || '').split(',').map(function (v) { return v.trim().toLowerCase(); });
      if (String(kanonisch).trim().toLowerCase() === gesucht || varianten.indexOf(gesucht) !== -1) {
        sheet.getRange(i + 2, 3).setValue(jetzt);
        return { kanonisch: kanonisch, istNeu: false };
      }
    }
  }

  sheet.appendRow([klartext_(name), '', jetzt]);
  return { kanonisch: name, istNeu: true };
}

/**
 * Fügt weitere Schreibvarianten/Aliase zu einem bereits bekannten kanonischen
 * Namen hinzu (z.B. "Herr Eckert, auch Alex genannt, von Firma Inwatec").
 * Bestehende Varianten bleiben erhalten, Duplikate werden ausgelassen.
 */
function aliaseHinzufuegen_(sheet, kanonischerName, aliase, jetzt) {
  if (!aliase || !aliase.length) return;
  var letzteZeile = sheet.getLastRow();
  if (letzteZeile < 2) return;
  var gesucht = kanonischerName.trim().toLowerCase();
  var werte = sheet.getRange(2, 1, letzteZeile - 1, 2).getValues();

  for (var i = 0; i < werte.length; i++) {
    if (String(werte[i][0]).trim().toLowerCase() !== gesucht) continue;

    var vorhandene = (werte[i][1] || '').split(',').map(function (v) { return v.trim(); }).filter(String);
    var vorhandeneKlein = vorhandene.map(function (v) { return v.toLowerCase(); });

    aliase.forEach(function (alias) {
      alias = (alias || '').trim();
      if (!alias || alias.toLowerCase() === gesucht) return;
      if (vorhandeneKlein.indexOf(alias.toLowerCase()) === -1) {
        vorhandene.push(alias);
        vorhandeneKlein.push(alias.toLowerCase());
      }
    });

    sheet.getRange(i + 2, 2).setValue(klartext_(vorhandene.join(', ')));
    sheet.getRange(i + 2, 3).setValue(jetzt);
    return;
  }
}
