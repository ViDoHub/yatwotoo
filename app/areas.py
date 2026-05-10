# Known Yad2 area taxonomy for real estate
# These are used for the area filter dropdown in the UI

# Regions as used by the new realestate-feed API (replaces old topArea)
TOP_AREAS = {
    1: "מרכז והשרון",
    2: "דרום",
    3: "תל אביב והסביבה",
    4: "יהודה, שומרון ובקעת הירדן",
    5: "מישור החוף הצפוני",
    6: "ירושלים",
    7: "צפון ועמקים",
    8: "ירושלים והסביבה",
}

# Sub-areas mapped to their top_area (region ID from the new realestate-feed API)
AREAS = {
    # Tel Aviv (region 3)
    1: {"name": "תל אביב - דרום העיר", "top_area_id": 3},
    2: {"name": "תל אביב - מרכז העיר", "top_area_id": 3},
    3: {"name": "תל אביב - צפון הישן", "top_area_id": 3},
    4: {"name": "תל אביב - צפון החדש", "top_area_id": 3},
    5: {"name": "תל אביב - יפו", "top_area_id": 3},
    6: {"name": "תל אביב - פלורנטין נווה שאנן", "top_area_id": 3},
    # HaMerkaz (region 1)
    8: {"name": "פתח תקווה והסביבה", "top_area_id": 1},
    9: {"name": "ראשון לציון והסביבה", "top_area_id": 1},
    11: {"name": "רמת גן - גבעתיים", "top_area_id": 1},
    12: {"name": "בני ברק - רמת אלחנן", "top_area_id": 1},
    13: {"name": "חולון - בת ים", "top_area_id": 1},
    14: {"name": "רמלה - לוד", "top_area_id": 1},
    # HaSharon (region 1 - part of מרכז והשרון)
    17: {"name": "נתניה והסביבה", "top_area_id": 1},
    18: {"name": "הרצליה", "top_area_id": 1},
    19: {"name": "כפר סבא - הוד השרון", "top_area_id": 1},
    20: {"name": "רעננה", "top_area_id": 1},
    21: {"name": "רמת השרון", "top_area_id": 1},
    # HaShfela (region 2 - דרום)
    22: {"name": "רחובות - נס ציונה", "top_area_id": 2},
    23: {"name": "אשדוד - אשקלון", "top_area_id": 2},
    24: {"name": "קריית גת והסביבה", "top_area_id": 2},
    25: {"name": "גדרה - יבנה", "top_area_id": 2},
    # Jerusalem (region 6 - ירושלים והסביבה)
    27: {"name": "ירושלים", "top_area_id": 6},
    28: {"name": "בית שמש והסביבה", "top_area_id": 6},
    29: {"name": "מעלה אדומים והסביבה", "top_area_id": 6},
    # Haifa (region 5 - מישור החוף הצפוני)
    31: {"name": "חיפה", "top_area_id": 5},
    32: {"name": "קריות", "top_area_id": 5},
    33: {"name": "עכו - נהריה", "top_area_id": 5},
    # HaTzafon (region 7 - צפון ועמקים)
    35: {"name": "טבריה והסביבה", "top_area_id": 7},
    36: {"name": "נצרת והסביבה", "top_area_id": 7},
    37: {"name": "עפולה והעמקים", "top_area_id": 7},
    38: {"name": "צפת והסביבה", "top_area_id": 7},
    39: {"name": "קריית שמונה והסביבה", "top_area_id": 7},
    # HaNegev (region 2 - דרום)
    41: {"name": "באר שבע והסביבה", "top_area_id": 2},
    42: {"name": "ערד והסביבה", "top_area_id": 2},
    43: {"name": "דימונה והסביבה", "top_area_id": 2},
    # Eilat (region 2 - דרום)
    45: {"name": "אילת", "top_area_id": 2},
    # Hadera (region 5 - מישור החוף הצפוני)
    51: {"name": "חדרה והסביבה", "top_area_id": 5},
    52: {"name": "זכרון יעקב והסביבה", "top_area_id": 5},
}

# City codes (common ones)
CITIES = {
    5000: "תל אביב יפו",
    3000: "ירושלים",
    4000: "חיפה",
    6400: "הרצליה",
    8700: "רעננה",
    9700: "כפר סבא",
    7400: "נתניה",
    7900: "פתח תקווה",
    8600: "רמת גן",
    6200: "הוד השרון",
    2600: "גבעתיים",
    6600: "חולון",
    2100: "בת ים",
    8300: "ראשון לציון",
    70: "אשדוד",
    2800: "גדרה",
    7500: "נס ציונה",
    8200: "רחובות",
    1200: "באר שבע",
    2610: "גבעת שמואל",
    6900: "כפר יונה",
    9400: "קריית אונו",
    9200: "קריית ביאליק",
    9300: "קריית מוצקין",
    400: "אור יהודה",
    2500: "בני ברק",
    7200: "נהריה",
    6100: "הרצליה פיתוח",
    1139: "בית שמש",
}
