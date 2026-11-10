-- Data mapping only (nothing changed or deleted): dumbbell-PAIR sets logged before v2.2 were entered as the
-- total of both dumbbells (user notes on 2026-11-09: "40 = 20 kg each hand", "20 = 10 kg each arm").
-- Tag them so analysis/recommendations convert to per-hand (= weight_kg / 2). weight_kg itself is untouched.
UPDATE `sets` SET `kg_basis` = 'total'
WHERE `kg_basis` IS NULL
  AND `weight_kg` IS NOT NULL
  AND `ex_key` IN ('db_bench','incline_db','db_ohp','db_lateral','db_curl','incline_curl','hammer_curl','db_shrug','rear_delt_fly','cs_row','db_rdl','farmer_carry','bss','walking_lunge','kelso_shrug');
