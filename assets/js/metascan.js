/* ==========================================================
   MetaScan: قارئ ميتاداتا شامل يعمل كله داخل المتصفح، بلا مكتبات خارجية.
   يقرأ بنية الملف نفسها: JPEG / PNG / WebP / GIF / TIFF / HEIC / AVIF،
   وقراءة فقط لـ MP4 / MOV و PDF.
   يستخرج: EXIF و GPS و IPTC و XMP و ICC و JFIF و Photoshop IRB ونصوص PNG
   والتعليقات والصور المصغّرة والبيانات الملحقة بعد نهاية الصورة.
   window.MetaScan = { scan, analyze, fmtDate, SECTIONS }
   ========================================================== */
(function () {
  "use strict";

  /* ---------- أدوات بايتات ---------- */
  const latin1 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return s; };
  const utf8 = (u8) => { try { return new TextDecoder("utf-8", { fatal: true }).decode(u8); } catch { return new TextDecoder("windows-1252").decode(u8); } };
  const ascii = (d, i, n) => latin1(d.subarray(i, Math.min(d.length, i + n)));
  const zstr = (u8) => { const z = u8.indexOf(0); return utf8(z >= 0 ? u8.subarray(0, z) : u8).trim(); };
  const utf16 = (b, le) => { let s = ""; for (let i = 0; i + 1 < b.length; i += 2) { const c = le ? b[i] | (b[i + 1] << 8) : (b[i] << 8) | b[i + 1]; if (c) s += String.fromCharCode(c); } return s.trim(); };
  const u32be = (d, o) => ((d[o] << 24) | (d[o + 1] << 16) | (d[o + 2] << 8) | d[o + 3]) >>> 0;
  const u16be = (d, o) => (d[o] << 8) | d[o + 1];
  const u32le = (d, o) => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;
  const hex = (n, w = 4) => n.toString(16).toUpperCase().padStart(w, "0");
  const pad = (n) => String(n).padStart(2, "0");
  const bytesLabel = (n) => n < 1024 ? `${n} بايت` : n < 1048576 ? `${(n / 1024).toFixed(1)} ك.ب` : `${(n / 1048576).toFixed(2)} م.ب`;
  async function inflate(u8) {
    try { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer()); }
    catch { return null; }
  }

  /* ---------- أقسام العرض ---------- */
  const SECTIONS = [
    { id: "gps", title: "الموقع الجغرافي", icon: "map-pin" },
    { id: "device", title: "الجهاز والكاميرا", icon: "smartphone" },
    { id: "time", title: "التواريخ والأوقات", icon: "calendar-clock" },
    { id: "shoot", title: "إعدادات التصوير", icon: "aperture" },
    { id: "author", title: "الوصف والمؤلف والحقوق", icon: "user-round" },
    { id: "software", title: "البرامج وآثار التعديل", icon: "history" },
    { id: "text", title: "نصوص وتعليقات مضمّنة", icon: "message-square-text" },
    { id: "doc", title: "بيانات المستند أو الفيديو", icon: "file-text" },
    { id: "image", title: "خصائص الصورة والضغط", icon: "image" },
    { id: "icc", title: "ملف الألوان (ICC)", icon: "palette" },
    { id: "xmp", title: "حقول XMP أخرى", icon: "file-code" },
    { id: "exif", title: "حقول EXIF أخرى", icon: "list" },
    { id: "structure", title: "بنية الملف (المقاطع)", icon: "layers" }
  ];

  /* ---------- الأسماء والشروح العربية: "الاسم|الشرح" ---------- */
  const L = {
    Make: "الشركة المصنّعة|الشركة التي صنعت الكاميرا أو الهاتف.", Model: "طراز الجهاز|اسم الهاتف أو الكاميرا التي التقطت الصورة.",
    LensMake: "صانع العدسة", LensModel: "العدسة", LensInfo: "مدى العدسة", LensSerialNumber: "الرقم التسلسلي للعدسة|رقم فريد يمكن ربطه بمالك العدسة.",
    BodySerialNumber: "الرقم التسلسلي للكاميرا|رقم فريد للجهاز: صورتان بالرقم نفسه التقطتهما الكاميرا نفسها.", CameraOwnerName: "اسم مالك الكاميرا",
    HostComputer: "الجهاز المضيف|الحاسوب أو الهاتف الذي عالج الصورة.", ImageUniqueID: "المعرّف الفريد للصورة", UniqueCameraModel: "طراز الكاميرا (DNG)",
    MakerNote: "ملاحظات المصنّع (MakerNote)|بيانات خاصة تكتبها الكاميرا بصيغة الشركة المصنّعة. وجودها يرجّح أن EXIF كتبته كاميرا حقيقية، ولا نفكّ محتواها التفصيلي.",
    Software: "البرنامج|آخر برنامج كتب الملف: إصدار نظام الهاتف في الصور الأصلية، أو اسم برنامج التعديل.", ProcessingSoftware: "برنامج المعالجة",
    ModifyDate: "تاريخ آخر حفظ (EXIF)|يتغيّر كلما حُفظت الصورة ببرنامج. إن كان بعد تاريخ الالتقاط فالصورة أُعيد حفظها.",
    DateTimeOriginal: "تاريخ الالتقاط|لحظة ضغط زر التصوير بتوقيت ساعة الكاميرا (قد تكون مضبوطة خطأ).",
    CreateDate: "تاريخ الرقمنة|لحظة تحويل الصورة إلى ملف رقمي. يطابق تاريخ الالتقاط في الكاميرات الرقمية.",
    OffsetTime: "فرق التوقيت عند الحفظ", OffsetTimeOriginal: "فرق التوقيت عند الالتقاط|فرق ساعة الكاميرا عن التوقيت العالمي (العراق +03:00).", OffsetTimeDigitized: "فرق التوقيت عند الرقمنة",
    SubSecTime: "أجزاء الثانية (حفظ)", SubSecTimeOriginal: "أجزاء الثانية (التقاط)", SubSecTimeDigitized: "أجزاء الثانية (رقمنة)",
    ExposureTime: "سرعة الغالق", FNumber: "فتحة العدسة", ISO: "حساسية ISO", FocalLength: "البعد البؤري", FocalLengthIn35mmFormat: "البعد البؤري (مكافئ 35 ملم)",
    Flash: "الفلاش", ExposureProgram: "برنامج التعريض", MeteringMode: "نمط قياس الضوء", WhiteBalance: "توازن الأبيض", ExposureMode: "نمط التعريض",
    ExposureCompensation: "تعويض التعريض", SceneCaptureType: "نوع المشهد", BrightnessValue: "السطوع", ShutterSpeedValue: "سرعة الغالق (APEX)",
    ApertureValue: "الفتحة (APEX)", MaxApertureValue: "أقصى فتحة للعدسة", DigitalZoomRatio: "التقريب الرقمي", LightSource: "مصدر الضوء", SubjectDistance: "بُعد الهدف",
    SubjectDistanceRange: "مدى بُعد الهدف", Contrast: "التباين", Saturation: "التشبّع", Sharpness: "الحدّة", SensingMethod: "نوع الحسّاس", GainControl: "التحكم بالكسب",
    CustomRendered: "معالجة خاصة|تدل على معالجة آلية داخل الهاتف مثل HDR أو البورتريه.", SceneType: "نوع المصدر", FileSource: "مصدر الملف", CompositeImage: "صورة مركّبة",
    SensitivityType: "نوع الحساسية", RecommendedExposureIndex: "مؤشر التعريض", StandardOutputSensitivity: "الحساسية القياسية", ExposureIndex: "مؤشر التعريض", SubjectArea: "منطقة الهدف",
    Orientation: "اتجاه الصورة|كيف يجب تدوير الصورة عند العرض.", ColorSpace: "فضاء الألوان", ExifImageWidth: "العرض المسجّل في EXIF|عرض الصورة لحظة الالتقاط. اختلافه عن العرض الفعلي يعني أنها قُصّت أو صُغّرت.",
    ExifImageHeight: "الارتفاع المسجّل في EXIF", ImageWidth: "العرض", ImageHeight: "الارتفاع", XResolution: "الدقة الأفقية", YResolution: "الدقة العمودية", ResolutionUnit: "وحدة الدقة",
    ExifVersion: "إصدار EXIF", FlashpixVersion: "إصدار Flashpix", ComponentsConfiguration: "ترتيب المكوّنات اللونية", YCbCrPositioning: "موضع YCbCr", YCbCrSubSampling: "تقليل عيّنات اللون",
    Compression: "الضغط", BitsPerSample: "البتات لكل قناة", SamplesPerPixel: "القنوات لكل بكسل", PhotometricInterpretation: "التفسير اللوني", CompressedBitsPerPixel: "البتات المضغوطة لكل بكسل",
    InteropIndex: "مؤشر التوافق", InteropVersion: "إصدار التوافق", Gamma: "غاما", Padding: "حشو ويندوز|مساحة يتركها ويندوز عند تعديل خصائص الصورة من مستكشف الملفات.", OffsetSchema: "إزاحة ويندوز",
    Artist: "المصوّر / المؤلف", Copyright: "حقوق النشر", ImageDescription: "وصف الصورة", UserComment: "تعليق المستخدم", DocumentName: "اسم المستند",
    XPTitle: "العنوان (ويندوز)", XPComment: "التعليق (ويندوز)", XPAuthor: "المؤلف (ويندوز)", XPKeywords: "الكلمات المفتاحية (ويندوز)", XPSubject: "الموضوع (ويندوز)", Rating: "التقييم بالنجوم", RatingPercent: "التقييم %",
    GPSLatitude: "خط العرض", GPSLongitude: "خط الطول", GPSAltitude: "الارتفاع", GPSTimeStamp: "وقت GPS (عالمي UTC)|يأتي من الأقمار الصناعية لا من ساعة الكاميرا، فهو أدقّ ويصعب أن يكون خطأ عفوياً.",
    GPSDateStamp: "تاريخ GPS (عالمي UTC)", GPSSpeed: "السرعة لحظة التصوير", GPSImgDirection: "اتجاه الكاميرا|الجهة التي كانت العدسة موجّهة إليها. يفيد في مطابقة المشهد مع الخريطة.",
    GPSTrack: "اتجاه الحركة", GPSHPositioningError: "دقة الموقع", GPSProcessingMethod: "طريقة تحديد الموقع|GPS من الأقمار، أو fused/network من الأبراج والواي فاي (أقل دقة).",
    GPSMapDatum: "المرجع الجيوديسي", GPSStatus: "حالة المستقبِل", GPSMeasureMode: "نمط القياس", GPSDOP: "تشتت الدقة (DOP)", GPSSatellites: "الأقمار المستخدمة", GPSVersionID: "إصدار GPS",
    GPSDestBearing: "اتجاه الوجهة", GPSDestLatitude: "خط عرض الوجهة", GPSDestLongitude: "خط طول الوجهة", GPSAreaInformation: "اسم المنطقة", GPSDifferential: "تصحيح تفاضلي", GPSDestDistance: "المسافة إلى الوجهة",
    position: "الإحداثيات العشرية",
    /* IPTC */
    ObjectName: "العنوان", Keywords: "الكلمات المفتاحية", SpecialInstructions: "تعليمات خاصة", DateCreated: "تاريخ إنشاء المحتوى", TimeCreated: "وقت إنشاء المحتوى",
    DigitalCreationDate: "تاريخ الرقمنة", DigitalCreationTime: "وقت الرقمنة", OriginatingProgram: "البرنامج المنشئ", ProgramVersion: "إصدار البرنامج", Byline: "المصوّر",
    BylineTitle: "صفة المصوّر", City: "المدينة", Sublocation: "الموقع داخل المدينة", ProvinceState: "المحافظة / الولاية", CountryCode: "رمز الدولة", Country: "الدولة",
    OriginalTransmissionReference: "مرجع الإرسال", Headline: "العنوان الرئيسي", Credit: "الجهة المعتمَدة", Source: "المصدر", CopyrightNotice: "إشعار الحقوق", Contact: "جهة الاتصال",
    Caption: "التعليق / الشرح", Writer: "كاتب التعليق", Category: "التصنيف", SupplementalCategories: "تصنيفات إضافية", Urgency: "الأولوية", EditStatus: "حالة التحرير",
    ReleaseDate: "تاريخ النشر", ReleaseTime: "وقت النشر", ContentLocationName: "مكان المحتوى", SubjectReference: "رمز الموضوع",
    /* XMP */
    "dc:title": "العنوان", "dc:description": "الوصف", "dc:creator": "المنشئ", "dc:subject": "الكلمات المفتاحية", "dc:rights": "الحقوق", "dc:format": "صيغة الملف", "dc:publisher": "الناشر", "dc:source": "المصدر",
    "xmp:CreatorTool": "أداة الإنشاء|أول برنامج أو جهاز أنشأ الملف.", "xmp:CreateDate": "تاريخ الإنشاء (XMP)", "xmp:ModifyDate": "تاريخ التعديل (XMP)", "xmp:MetadataDate": "تاريخ آخر تعديل للميتاداتا",
    "xmp:Rating": "التقييم", "xmp:Label": "الوسم اللوني", "xmpMM:DocumentID": "معرّف المستند|رقم ثابت يرافق الملف عبر نسخه المعدّلة، ويمكن به ربط صورتين بالأصل نفسه.",
    "xmpMM:InstanceID": "معرّف هذه النسخة", "xmpMM:OriginalDocumentID": "معرّف المستند الأصلي|معرّف الملف الأول الذي اشتُقّت منه هذه النسخة.", "xmpMM:DerivedFrom": "مشتقّة من",
    "xmpMM:History": "سجل التحرير", "photoshop:DocumentAncestors": "ملفات أسلاف (فوتوشوب)|معرّفات ملفات أخرى لُصقت أجزاء منها في هذه الصورة. وجودها قرينة على التركيب.",
    "photoshop:DateCreated": "تاريخ إنشاء المحتوى (فوتوشوب)", "photoshop:City": "المدينة", "photoshop:Country": "الدولة", "photoshop:State": "المحافظة", "photoshop:Credit": "الجهة المعتمَدة",
    "photoshop:Source": "المصدر", "photoshop:Headline": "العنوان الرئيسي", "photoshop:AuthorsPosition": "صفة المصوّر", "photoshop:CaptionWriter": "كاتب التعليق", "photoshop:Instructions": "تعليمات",
    "photoshop:ColorMode": "نمط الألوان", "photoshop:ICCProfile": "ملف الألوان", "photoshop:TextLayers": "طبقات نصية",
    "Iptc4xmpExt:DigitalSourceType": "نوع المصدر الرقمي|وسم معياري يصرّح كيف أُنشئت الصورة: كاميرا، أو تعديل، أو ذكاء اصطناعي.", "Iptc4xmpCore:Location": "الموقع", "Iptc4xmpCore:CountryCode": "رمز الدولة",
    "Iptc4xmpCore:CreatorContactInfo": "بيانات الاتصال بالمصوّر", "Iptc4xmpExt:PersonInImage": "أشخاص في الصورة", "Iptc4xmpExt:LocationCreated": "مكان الالتقاط", "Iptc4xmpExt:LocationShown": "المكان الظاهر",
    "xmpRights:Marked": "محمية بحقوق", "xmpRights:UsageTerms": "شروط الاستخدام", "xmpRights:WebStatement": "رابط بيان الحقوق", "aux:Lens": "العدسة", "aux:SerialNumber": "الرقم التسلسلي للكاميرا",
    "aux:LensSerialNumber": "الرقم التسلسلي للعدسة", "aux:OwnerName": "اسم المالك", "exifEX:BodySerialNumber": "الرقم التسلسلي للكاميرا", "exifEX:LensModel": "العدسة", "exifEX:CameraOwnerName": "اسم المالك",
    "GCamera:MotionPhoto": "صورة متحركة (Motion Photo)", "GCamera:MicroVideo": "فيديو مضمّن", "xmpNote:HasExtendedXMP": "يوجد XMP ممتد", "xmp:BaseURL": "الرابط الأصلي"
  };
  const lab = (key) => { const v = L[key] || L[String(key).replace(/^[^:]*:/, "")]; if (!v) return [key, ""]; const i = v.indexOf("|"); return i < 0 ? [v, ""] : [v.slice(0, i), v.slice(i + 1)]; };

  /* حقول حساسة للخصوصية */
  const SENS = /^(GPS(Latitude|Longitude|Altitude|TimeStamp|DateStamp|ImgDirection|Speed|DestLatitude|DestLongitude|AreaInformation)|position|Make|Model|LensModel|BodySerialNumber|LensSerialNumber|CameraOwnerName|HostComputer|ImageUniqueID|Artist|Copyright|DateTimeOriginal|CreateDate|UserComment|XPAuthor|XPComment|Byline|City|Sublocation|ProvinceState|Country|Contact|Software|MakerNote)$/;
  const SENS_X = /^(exif:GPS|xmpMM:(DocumentID|InstanceID|OriginalDocumentID)|dc:creator|aux:(SerialNumber|LensSerialNumber|OwnerName)|exifEX:(BodySerialNumber|CameraOwnerName)|Iptc4xmpCore:(CreatorContactInfo|Location)|Iptc4xmpExt:(PersonInImage|LocationCreated)|photoshop:(City|State|Country)|xmp:CreatorTool|mwg-rs:|MP:)/;

  /* ---------- جداول EXIF ---------- */
  const T0 = { 0x000B: "ProcessingSoftware", 0x00FE: "SubfileType", 0x0100: "ImageWidth", 0x0101: "ImageHeight", 0x0102: "BitsPerSample", 0x0103: "Compression", 0x0106: "PhotometricInterpretation", 0x010D: "DocumentName", 0x010E: "ImageDescription", 0x010F: "Make", 0x0110: "Model", 0x0111: "StripOffsets", 0x0112: "Orientation", 0x0115: "SamplesPerPixel", 0x0116: "RowsPerStrip", 0x0117: "StripByteCounts", 0x011A: "XResolution", 0x011B: "YResolution", 0x011C: "PlanarConfiguration", 0x0128: "ResolutionUnit", 0x012D: "TransferFunction", 0x0131: "Software", 0x0132: "ModifyDate", 0x013B: "Artist", 0x013C: "HostComputer", 0x013E: "WhitePoint", 0x013F: "PrimaryChromaticities", 0x0201: "ThumbnailOffset", 0x0202: "ThumbnailLength", 0x0211: "YCbCrCoefficients", 0x0212: "YCbCrSubSampling", 0x0213: "YCbCrPositioning", 0x0214: "ReferenceBlackWhite", 0x02BC: "XMLPacket", 0x4746: "Rating", 0x4749: "RatingPercent", 0x8298: "Copyright", 0x83BB: "IPTC-NAA", 0x8649: "PhotoshopIRB", 0x8769: "ExifIFD", 0x8773: "ICCProfile", 0x8825: "GPSIFD", 0x9C9B: "XPTitle", 0x9C9C: "XPComment", 0x9C9D: "XPAuthor", 0x9C9E: "XPKeywords", 0x9C9F: "XPSubject", 0xC4A5: "PrintIM", 0xC612: "DNGVersion", 0xC614: "UniqueCameraModel", 0xEA1C: "Padding", 0xEA1D: "OffsetSchema",
    0x829A: "ExposureTime", 0x829D: "FNumber", 0x8822: "ExposureProgram", 0x8824: "SpectralSensitivity", 0x8827: "ISO", 0x8830: "SensitivityType", 0x8831: "StandardOutputSensitivity", 0x8832: "RecommendedExposureIndex", 0x9000: "ExifVersion", 0x9003: "DateTimeOriginal", 0x9004: "CreateDate", 0x9010: "OffsetTime", 0x9011: "OffsetTimeOriginal", 0x9012: "OffsetTimeDigitized", 0x9101: "ComponentsConfiguration", 0x9102: "CompressedBitsPerPixel", 0x9201: "ShutterSpeedValue", 0x9202: "ApertureValue", 0x9203: "BrightnessValue", 0x9204: "ExposureCompensation", 0x9205: "MaxApertureValue", 0x9206: "SubjectDistance", 0x9207: "MeteringMode", 0x9208: "LightSource", 0x9209: "Flash", 0x920A: "FocalLength", 0x9214: "SubjectArea", 0x927C: "MakerNote", 0x9286: "UserComment", 0x9290: "SubSecTime", 0x9291: "SubSecTimeOriginal", 0x9292: "SubSecTimeDigitized", 0xA000: "FlashpixVersion", 0xA001: "ColorSpace", 0xA002: "ExifImageWidth", 0xA003: "ExifImageHeight", 0xA004: "RelatedSoundFile", 0xA005: "InteropIFD", 0xA20E: "FocalPlaneXResolution", 0xA20F: "FocalPlaneYResolution", 0xA210: "FocalPlaneResolutionUnit", 0xA215: "ExposureIndex", 0xA217: "SensingMethod", 0xA300: "FileSource", 0xA301: "SceneType", 0xA302: "CFAPattern", 0xA401: "CustomRendered", 0xA402: "ExposureMode", 0xA403: "WhiteBalance", 0xA404: "DigitalZoomRatio", 0xA405: "FocalLengthIn35mmFormat", 0xA406: "SceneCaptureType", 0xA407: "GainControl", 0xA408: "Contrast", 0xA409: "Saturation", 0xA40A: "Sharpness", 0xA40C: "SubjectDistanceRange", 0xA420: "ImageUniqueID", 0xA430: "CameraOwnerName", 0xA431: "BodySerialNumber", 0xA432: "LensInfo", 0xA433: "LensMake", 0xA434: "LensModel", 0xA435: "LensSerialNumber", 0xA460: "CompositeImage", 0xA500: "Gamma" };
  const TG = ["GPSVersionID", "GPSLatitudeRef", "GPSLatitude", "GPSLongitudeRef", "GPSLongitude", "GPSAltitudeRef", "GPSAltitude", "GPSTimeStamp", "GPSSatellites", "GPSStatus", "GPSMeasureMode", "GPSDOP", "GPSSpeedRef", "GPSSpeed", "GPSTrackRef", "GPSTrack", "GPSImgDirectionRef", "GPSImgDirection", "GPSMapDatum", "GPSDestLatitudeRef", "GPSDestLatitude", "GPSDestLongitudeRef", "GPSDestLongitude", "GPSDestBearingRef", "GPSDestBearing", "GPSDestDistanceRef", "GPSDestDistance", "GPSProcessingMethod", "GPSAreaInformation", "GPSDateStamp", "GPSDifferential", "GPSHPositioningError"];
  const TI = { 1: "InteropIndex", 2: "InteropVersion" };
  const SIZES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 13: 4 };

  const ENUM = {
    Orientation: { 1: "عادي (بلا تدوير)", 2: "معكوس أفقياً", 3: "مقلوب 180°", 4: "معكوس عمودياً", 5: "معكوس ومدوّر 90°", 6: "مدوّر 90° مع عقارب الساعة", 7: "معكوس ومدوّر 270°", 8: "مدوّر 90° عكس عقارب الساعة" },
    ExposureProgram: { 0: "غير محدد", 1: "يدوي", 2: "تلقائي عادي", 3: "أولوية الفتحة", 4: "أولوية الغالق", 5: "إبداعي", 6: "حركة", 7: "بورتريه", 8: "منظر طبيعي" },
    MeteringMode: { 0: "غير معروف", 1: "متوسط", 2: "متوسط مع ترجيح المركز", 3: "نقطي", 4: "متعدد النقاط", 5: "نمطي (مصفوفة)", 6: "جزئي", 255: "آخر" },
    WhiteBalance: { 0: "تلقائي", 1: "يدوي" }, ExposureMode: { 0: "تلقائي", 1: "يدوي", 2: "تصوير متدرّج (Bracket)" },
    SceneCaptureType: { 0: "عادي", 1: "منظر طبيعي", 2: "بورتريه", 3: "ليلي" }, ColorSpace: { 1: "sRGB", 2: "Adobe RGB", 65535: "غير معايَر (ملف ألوان واسع)" },
    ResolutionUnit: { 1: "بلا وحدة", 2: "بوصة", 3: "سنتيمتر" }, FocalPlaneResolutionUnit: { 2: "بوصة", 3: "سنتيمتر" },
    LightSource: { 0: "غير معروف", 1: "ضوء النهار", 2: "فلورسنت", 3: "تنغستن", 4: "فلاش", 9: "طقس صافٍ", 10: "غائم", 11: "ظل", 255: "آخر" },
    SensingMethod: { 1: "غير محدد", 2: "حسّاس لوني بشريحة واحدة", 3: "شريحتان", 4: "ثلاث شرائح", 5: "تتابعي", 7: "خطّي ثلاثي", 8: "خطّي تتابعي" },
    Contrast: { 0: "عادي", 1: "منخفض", 2: "مرتفع" }, Saturation: { 0: "عادي", 1: "منخفض", 2: "مرتفع" }, Sharpness: { 0: "عادي", 1: "ناعم", 2: "حادّ" },
    CustomRendered: { 0: "بلا معالجة خاصة", 1: "معالجة خاصة", 2: "HDR (بلا الأصل)", 3: "HDR (مع حفظ الأصل)", 4: "الأصل (لصورة HDR)", 6: "بانوراما", 7: "بورتريه HDR", 8: "بورتريه" },
    GainControl: { 0: "بلا", 1: "رفع منخفض", 2: "رفع عالٍ", 3: "خفض منخفض", 4: "خفض عالٍ" }, SubjectDistanceRange: { 0: "غير معروف", 1: "ماكرو", 2: "قريب", 3: "بعيد" },
    FileSource: { 1: "ماسح أفلام", 2: "ماسح ضوئي", 3: "كاميرا رقمية" }, SceneType: { 1: "صورة ملتقطة مباشرة" }, CompositeImage: { 0: "غير معروف", 1: "ليست مركّبة", 2: "مركّبة عامة", 3: "مركّبة أثناء الالتقاط" },
    Compression: { 1: "بلا ضغط", 5: "LZW", 6: "JPEG", 7: "JPEG", 8: "Deflate", 32773: "PackBits" }, YCbCrPositioning: { 1: "مركزي", 2: "متجاور" },
    PhotometricInterpretation: { 0: "أبيض = صفر", 1: "أسود = صفر", 2: "RGB", 3: "لوحة ألوان", 5: "CMYK", 6: "YCbCr" }, SensitivityType: { 1: "حساسية قياسية", 2: "مؤشر تعريض موصى به", 3: "ISO" },
    GPSAltitudeRef: { 0: "فوق سطح البحر", 1: "تحت سطح البحر" }, GPSStatus: { A: "قياس جارٍ", V: "قياس غير موثوق" }, GPSMeasureMode: { 2: "ثنائي الأبعاد", 3: "ثلاثي الأبعاد" }, GPSDifferential: { 0: "بلا تصحيح", 1: "مع تصحيح تفاضلي" }
  };
  const COMPASS = ["الشمال", "الشمال الشرقي", "الشرق", "الجنوب الشرقي", "الجنوب", "الجنوب الغربي", "الغرب", "الشمال الغربي"];
  const compass = (deg) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

  /* ---------- التواريخ ---------- */
  function wallFromExif(s) {
    const m = /^\s*(\d{4})[:\-\/.](\d\d)[:\-\/.](\d\d)(?:[ T](\d\d):(\d\d)(?::(\d\d))?)?/.exec(s || ""); if (!m) return null;
    const [y, mo, d, H, M, S] = m.slice(1).map((x) => +x || 0); if (!y || !mo || !d || mo > 12 || d > 31) return null;
    return Date.UTC(y, mo - 1, d, H, M, S);
  }
  function tzMin(s) { const m = /^\s*([+-])(\d\d):?(\d\d)\s*$/.exec(s || ""); return m ? (m[1] === "-" ? -1 : 1) * (+m[2] * 60 + +m[3]) : /^\s*Z\s*$/i.test(s || "") ? 0 : null; }
  function parseIso(s) {
    const m = /^\s*(\d{4})-?(\d\d)(?:-?(\d\d))?(?:[T ](\d\d):?(\d\d)(?::?(\d\d))?(?:\.\d+)?)?\s*(Z|[+-]\d\d:?\d\d)?/.exec(s || ""); if (!m) return null;
    const wall = Date.UTC(+m[1], +m[2] - 1, +(m[3] || 1), +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)); if (!isFinite(wall)) return null;
    return { wall, tz: m[7] ? tzMin(m[7]) : null, dateOnly: !m[4] };
  }
  const tzText = (tz) => tz == null ? "" : `UTC${tz < 0 ? "-" : "+"}${pad(Math.floor(Math.abs(tz) / 60))}:${pad(Math.abs(tz) % 60)}`;
  /* يعرض الوقت كما كُتب في الملف تماماً، بلا تحويل إلى توقيت جهاز القارئ */
  function fmtDate(wall, dateOnly) {
    if (wall == null || !isFinite(wall)) return "";
    try { return new Intl.DateTimeFormat("ar-IQ-u-nu-latn-ca-gregory", dateOnly ? { dateStyle: "full", timeZone: "UTC" } : { dateStyle: "full", timeStyle: "medium", timeZone: "UTC" }).format(wall); }
    catch { return new Date(wall).toISOString().replace("T", " ").slice(0, 19); }
  }
  const isoWall = (wall, dateOnly) => { const s = new Date(wall).toISOString(); return dateOnly ? s.slice(0, 10) : s.slice(0, 19).replace("T", " "); };

  /* ---------- قارئ TIFF / EXIF ---------- */
  function parseTiff(t) {
    if (!t || t.length < 8) return null;
    const le = t[0] === 0x49 && t[1] === 0x49; if (!le && !(t[0] === 0x4D && t[1] === 0x4D)) return null;
    const dv = new DataView(t.buffer, t.byteOffset, t.byteLength);
    const magic = dv.getUint16(2, le); if (magic !== 42 && magic !== 0x55 && magic !== 0x4F52) return null;
    const R = { ifd0: {}, exif: {}, gps: {}, interop: {}, ifd1: {}, errors: 0, le, thumb: null };
    const seen = new Set();
    const val = (type, cnt, p) => {
      if (type === 2) return zstr(t.subarray(p, p + Math.min(cnt, 65536)));
      if (type === 1 || type === 6 || type === 7) return cnt === 1 && type !== 7 ? t[p] : t.subarray(p, p + cnt);
      const n = Math.min(cnt, 512), a = [];
      for (let k = 0; k < n; k++) {
        const o = p + k * SIZES[type];
        if (type === 3) a.push(dv.getUint16(o, le)); else if (type === 8) a.push(dv.getInt16(o, le));
        else if (type === 4 || type === 13) a.push(dv.getUint32(o, le)); else if (type === 9) a.push(dv.getInt32(o, le));
        else if (type === 5) { const d = dv.getUint32(o + 4, le); a.push(d ? dv.getUint32(o, le) / d : null); }
        else if (type === 10) { const d = dv.getInt32(o + 4, le); a.push(d ? dv.getInt32(o, le) / d : null); }
        else if (type === 11) a.push(dv.getFloat32(o, le)); else if (type === 12) a.push(dv.getFloat64(o, le));
      }
      return cnt === 1 ? a[0] : a;
    };
    const readIFD = (off, dict, names) => {
      if (!off || off + 2 > t.length || seen.has(off)) return 0; seen.add(off);
      const n = dv.getUint16(off, le); if (n > 600) { R.errors++; return 0; }
      for (let k = 0; k < n; k++) {
        const e = off + 2 + k * 12; if (e + 12 > t.length) { R.errors++; break; }
        const tag = dv.getUint16(e, le), type = dv.getUint16(e + 2, le), cnt = dv.getUint32(e + 4, le), sz = SIZES[type];
        if (!sz) continue;
        const total = sz * cnt, p = total <= 4 ? e + 8 : dv.getUint32(e + 8, le);
        if (p + total > t.length || total > 64 * 1048576) { R.errors++; continue; }
        const name = names[tag] || `Tag_0x${hex(tag)}`;
        try { dict[name] = { tag, type, count: cnt, off: p, len: total, v: val(type, cnt, p) }; } catch { R.errors++; }
      }
      const next = off + 2 + n * 12; return next + 4 <= t.length ? dv.getUint32(next, le) : 0;
    };
    try {
      const next = readIFD(dv.getUint32(4, le), R.ifd0, T0);
      if (R.ifd0.ExifIFD) readIFD(R.ifd0.ExifIFD.v, R.exif, T0);
      if (R.ifd0.GPSIFD) readIFD(R.ifd0.GPSIFD.v, R.gps, TG);
      if (R.exif.InteropIFD) readIFD(R.exif.InteropIFD.v, R.interop, TI);
      if (next) readIFD(next, R.ifd1, T0);
      const o = R.ifd1.ThumbnailOffset, l = R.ifd1.ThumbnailLength;
      if (o && l && typeof o.v === "number" && o.v + l.v <= t.length && l.v > 100 && t[o.v] === 0xFF && t[o.v + 1] === 0xD8) R.thumb = t.subarray(o.v, o.v + l.v);
    } catch { R.errors++; }
    return R;
  }

  const MN_SIG = [[/^Apple iOS/, "Apple"], [/^Nikon/, "Nikon"], [/^OLYMP|^OM SYSTEM/, "Olympus"], [/^SONY (DSC|CAM|MOBILE)/, "Sony"], [/^FUJIFILM/, "Fujifilm"], [/^Panasonic/, "Panasonic"], [/^HUAWEI/, "Huawei"], [/^DJI/, "DJI"], [/^(AOC|PENTAX)/, "Pentax"], [/^Ricoh|^RICOH/, "Ricoh"], [/^SIGMA|^FOVEON/, "Sigma"], [/^LEICA/, "Leica"], [/^QVC|^CASIO/, "Casio"], [/^KDK|^Kodak/i, "Kodak"], [/^SAMSUNG/i, "Samsung"], [/^Xiaomi|^MI /i, "Xiaomi"], [/^OPPO|^oplus/i, "OPPO"], [/^MOT/, "Motorola"]];

  function userComment(b) {
    if (!b || !b.length) return ""; if (typeof b === "string") return b;
    const head = ascii(b, 0, 8), body = b.subarray(8);
    if (/^UNICODE/.test(head)) { const a = utf16(body, true), c = utf16(body, false); const ok = (s) => (s.match(/[\x20-\x7E؀-ۿ]/g) || []).length; return ok(a) >= ok(c) ? a : c; }
    if (/^(ASCII|JIS|\0{8})/.test(head)) return zstr(body);
    return zstr(b);
  }

  function dms(a, ref) {
    if (!Array.isArray(a) || a.length < 1 || a.some((x) => x == null || !isFinite(x))) return null;
    let v = (a[0] || 0) + (a[1] || 0) / 60 + (a[2] || 0) / 3600;
    if (/^[SW]/i.test(ref || "")) v = -v;
    return v;
  }
  const dmsText = (v, pos, neg) => { const a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60), s = ((a - d) * 60 - m) * 60; return `\u2066${d}° ${m}′ ${s.toFixed(2)}″\u2069 ${v >= 0 ? pos : neg}`; };

  /* قيمة EXIF بنصّ عربي مفهوم */
  function fmtExif(name, e, tags) {
    const v = e.v; const num = typeof v === "number";
    const bin = (b) => `[بيانات ثنائية: ${bytesLabel(b.length)}]`;
    if (v == null) return "";
    if (ENUM[name] && (num || typeof v === "string")) return ENUM[name][v] != null ? ENUM[name][v] : String(v);
    switch (name) {
      case "ExposureTime": return num ? (v < 1 && v > 0 ? `1/${Math.round(1 / v)} ثانية` : `${+v.toFixed(2)} ثانية`) : String(v);
      case "FNumber": return num ? `f/${+v.toFixed(1)}` : String(v);
      case "ApertureValue": case "MaxApertureValue": return num ? `f/${(Math.pow(2, v / 2)).toFixed(1)}` : String(v);
      case "ShutterSpeedValue": return num ? (v > 0 ? `1/${Math.round(Math.pow(2, v))} ثانية` : `${+Math.pow(2, -v).toFixed(1)} ثانية`) : String(v);
      case "FocalLength": case "FocalLengthIn35mmFormat": return num ? `${+v.toFixed(1)} ملم` : String(v);
      case "ExposureCompensation": case "BrightnessValue": return num ? `${v > 0 ? "+" : ""}${+v.toFixed(2)} EV` : String(v);
      case "SubjectDistance": return num ? `${+v.toFixed(2)} متر` : String(v);
      case "DigitalZoomRatio": return num ? (v ? `×${+v.toFixed(2)}` : "بلا تقريب رقمي") : String(v);
      case "Flash": { if (!num) return String(v); const mode = (v >> 3) & 3; return (v & 1 ? "أُطلق الفلاش" : "لم يُطلق الفلاش") + (mode === 3 ? " (وضع تلقائي)" : mode === 1 ? " (تشغيل إجباري)" : mode === 2 ? " (إيقاف إجباري)" : "") + (v & 0x40 ? "، مع تقليل احمرار العين" : ""); }
      case "ExifVersion": case "FlashpixVersion": case "InteropVersion": { const s = typeof v === "string" ? v : ascii(v, 0, 4); return /^\d{4}$/.test(s) ? `${+s.slice(0, 2)}.${s.slice(2)}` : s; }
      case "ComponentsConfiguration": return v.length ? [...v].map((c) => ["", "Y", "Cb", "Cr", "R", "G", "B"][c] || "").join(" ").trim() : String(v);
      case "LensInfo": return Array.isArray(v) && v.length === 4 ? `${v[0] === v[1] ? +v[0] : `${+v[0]}-${+v[1]}`} ملم${v[2] ? ` f/${v[2] === v[3] || !v[3] ? +v[2] : `${+v[2]}-${+v[3]}`}` : ""}` : String(v);
      case "UserComment": return userComment(v);
      case "XPTitle": case "XPComment": case "XPAuthor": case "XPKeywords": case "XPSubject": return v.length ? utf16(v, true) : String(v);
      case "MakerNote": return bin(v);
      case "ModifyDate": case "DateTimeOriginal": case "CreateDate": { const w = wallFromExif(v); return w == null ? `${v} (غير صالح أو غير مضبوط)` : `${fmtDate(w)}`; }
      case "GPSVersionID": return v.length ? [...v].join(".") : String(v);
      case "GPSLatitude": { const x = dms(v, tags.GPSLatitudeRef && tags.GPSLatitudeRef.v); return x == null ? "" : dmsText(x, "شمالاً", "جنوباً"); }
      case "GPSLongitude": { const x = dms(v, tags.GPSLongitudeRef && tags.GPSLongitudeRef.v); return x == null ? "" : dmsText(x, "شرقاً", "غرباً"); }
      case "GPSDestLatitude": { const x = dms(v, tags.GPSDestLatitudeRef && tags.GPSDestLatitudeRef.v); return x == null ? "" : dmsText(x, "شمالاً", "جنوباً"); }
      case "GPSDestLongitude": { const x = dms(v, tags.GPSDestLongitudeRef && tags.GPSDestLongitudeRef.v); return x == null ? "" : dmsText(x, "شرقاً", "غرباً"); }
      case "GPSAltitude": return num ? `${+v.toFixed(1)} متر ${tags.GPSAltitudeRef && tags.GPSAltitudeRef.v === 1 ? "تحت" : "فوق"} سطح البحر` : String(v);
      case "GPSTimeStamp": return Array.isArray(v) ? `${pad(Math.floor(v[0] || 0))}:${pad(Math.floor(v[1] || 0))}:${pad(Math.floor(v[2] || 0))} UTC` : String(v);
      case "GPSSpeed": { const u = { K: "كم/ساعة", M: "ميل/ساعة", N: "عقدة" }[(tags.GPSSpeedRef && tags.GPSSpeedRef.v) || "K"] || ""; return num ? `${+v.toFixed(1)} ${u}` : String(v); }
      case "GPSImgDirection": case "GPSTrack": case "GPSDestBearing": { const r = tags[name + "Ref"] && tags[name + "Ref"].v; return num ? `${+v.toFixed(1)}° نحو ${compass(v)}${r === "M" ? " (شمال مغناطيسي)" : ""}` : String(v); }
      case "GPSHPositioningError": return num ? `± ${+v.toFixed(1)} متر` : String(v);
      case "GPSProcessingMethod": case "GPSAreaInformation": return userComment(v);
      case "XResolution": case "YResolution": return num ? String(+v.toFixed(2)) : String(v);
    }
    if (v instanceof Uint8Array) return v.length <= 16 ? [...v].join(" ") : bin(v);
    if (Array.isArray(v)) return v.length > 16 ? `[${v.length} قيمة]` : v.map((x) => (typeof x === "number" ? +x.toFixed(4) : x)).join("، ");
    if (num) return String(+v.toFixed(4));
    return String(v);
  }
  const rawOf = (v) => v instanceof Uint8Array ? `<${v.length} bytes>` : v;

  const SEC_EXIF = {
    device: ["Make", "Model", "LensMake", "LensModel", "LensInfo", "LensSerialNumber", "BodySerialNumber", "CameraOwnerName", "HostComputer", "ImageUniqueID", "UniqueCameraModel", "MakerNote"],
    time: ["ModifyDate", "DateTimeOriginal", "CreateDate", "OffsetTime", "OffsetTimeOriginal", "OffsetTimeDigitized", "SubSecTime", "SubSecTimeOriginal", "SubSecTimeDigitized"],
    shoot: ["ExposureTime", "FNumber", "ISO", "FocalLength", "FocalLengthIn35mmFormat", "Flash", "ExposureProgram", "MeteringMode", "WhiteBalance", "ExposureMode", "ExposureCompensation", "SceneCaptureType", "BrightnessValue", "ShutterSpeedValue", "ApertureValue", "MaxApertureValue", "DigitalZoomRatio", "LightSource", "SubjectDistance", "SubjectDistanceRange", "Contrast", "Saturation", "Sharpness", "SensingMethod", "GainControl", "CustomRendered", "SceneType", "FileSource", "CompositeImage", "SensitivityType", "RecommendedExposureIndex", "StandardOutputSensitivity", "ExposureIndex", "SubjectArea"],
    author: ["ImageDescription", "Artist", "Copyright", "UserComment", "XPTitle", "XPComment", "XPAuthor", "XPKeywords", "XPSubject", "Rating", "RatingPercent", "DocumentName"],
    software: ["Software", "ProcessingSoftware", "Padding", "OffsetSchema"],
    image: ["Orientation", "ColorSpace", "ExifImageWidth", "ExifImageHeight", "ImageWidth", "ImageHeight", "XResolution", "YResolution", "ResolutionUnit", "ExifVersion", "FlashpixVersion", "ComponentsConfiguration", "YCbCrPositioning", "YCbCrSubSampling", "Compression", "BitsPerSample", "SamplesPerPixel", "PhotometricInterpretation", "CompressedBitsPerPixel", "InteropIndex", "InteropVersion", "Gamma"]
  };
  const secOfExif = (name) => { for (const s in SEC_EXIF) if (SEC_EXIF[s].includes(name)) return s; return "exif"; };
  const SKIP_EXIF = /^(ExifIFD|GPSIFD|InteropIFD|ThumbnailOffset|ThumbnailLength|StripOffsets|StripByteCounts|RowsPerStrip|XMLPacket|IPTC-NAA|PhotoshopIRB|ICCProfile|PrintIM|GPS\w+Ref|TransferFunction|CFAPattern|SubfileType|PlanarConfiguration)$/;

  /* ---------- IPTC-IIM ---------- */
  const IIM = { 5: "ObjectName", 7: "EditStatus", 10: "Urgency", 12: "SubjectReference", 15: "Category", 20: "SupplementalCategories", 25: "Keywords", 27: "ContentLocationName", 30: "ReleaseDate", 35: "ReleaseTime", 40: "SpecialInstructions", 55: "DateCreated", 60: "TimeCreated", 62: "DigitalCreationDate", 63: "DigitalCreationTime", 65: "OriginatingProgram", 70: "ProgramVersion", 80: "Byline", 85: "BylineTitle", 90: "City", 92: "Sublocation", 95: "ProvinceState", 100: "CountryCode", 101: "Country", 103: "OriginalTransmissionReference", 105: "Headline", 110: "Credit", 115: "Source", 116: "CopyrightNotice", 118: "Contact", 120: "Caption", 122: "Writer" };
  function parseIIM(b) {
    const out = {}; let isUtf = false, i = 0;
    while (i + 5 <= b.length) {
      if (b[i] !== 0x1C) { i++; continue; }
      const rec = b[i + 1], ds = b[i + 2], len = u16be(b, i + 3);
      if (len & 0x8000 || i + 5 + len > b.length) break;
      const data = b.subarray(i + 5, i + 5 + len);
      if (rec === 1 && ds === 90) isUtf = ascii(data, 0, 3) === "\x1b%G";
      else if (rec === 2 && IIM[ds]) {
        let s; try { s = new TextDecoder("utf-8", { fatal: true }).decode(data); } catch { s = new TextDecoder(isUtf ? "utf-8" : "windows-1252").decode(data); }
        s = s.replace(/\0/g, "").trim();
        if (s) (out[IIM[ds]] = out[IIM[ds]] || []).push(s);
      }
      i += 5 + len;
    }
    return out;
  }
  const IRB_NAMES = { 0x03ED: "دقة الطباعة", 0x0404: "IPTC", 0x0406: "جودة حفظ JPEG", 0x040C: "صورة مصغّرة", 0x040F: "ملف ألوان ICC", 0x0414: "معرّفات المستند", 0x041A: "شرائح (Slices)", 0x041E: "قائمة روابط", 0x0421: "معلومات الإصدار", 0x0422: "EXIF", 0x0424: "XMP", 0x0425: "بصمة التعليق", 0x0426: "مقياس الطباعة", 0x0408: "شبكة وأدلّة", 0x0409: "صورة مصغّرة (قديمة)", 0x040A: "بيانات حقوق", 0x0BB7: "مسار قصّ" };
  function parseIRB(b, F) {
    let i = 0; if (ascii(b, 0, 13) === "Photoshop 3.0") i = 14;
    while (i + 12 <= b.length) {
      if (ascii(b, i, 4) !== "8BIM") { i++; continue; }
      const id = u16be(b, i + 4); let p = i + 6; const nl = b[p]; p += 1 + nl; if ((1 + nl) & 1) p++;
      const size = u32be(b, p); p += 4; if (p + size > b.length) break;
      const data = b.subarray(p, p + size);
      F.irb.push({ id, name: IRB_NAMES[id] || `مورد 0x${hex(id)}`, size });
      if (id === 0x0404 && !F.iptc) F.iptc = data;
      if ((id === 0x040C || id === 0x0409) && size > 128) { const j = data.subarray(28); if (j[0] === 0xFF && j[1] === 0xD8) F.thumbs.push({ src: "فوتوشوب", bytes: j }); }
      i = p + size + (size & 1);
    }
  }

  /* ---------- ICC ---------- */
  function parseICC(b) {
    if (!b || b.length < 132) return null;
    const sig = (o) => ascii(b, o, 4).replace(/\0/g, "").trim(); const out = { size: b.length };
    out.cmm = sig(4); out.version = `${b[8]}.${b[9] >> 4}.${b[9] & 15}`; out.cls = sig(12); out.space = sig(16);
    const y = u16be(b, 24); if (y > 1980 && y < 2100) out.date = Date.UTC(y, u16be(b, 26) - 1, u16be(b, 28), u16be(b, 30), u16be(b, 32), u16be(b, 34));
    out.platform = sig(40); out.maker = sig(48); out.model = sig(52); out.creator = sig(80);
    const n = Math.min(u32be(b, 128), 100);
    const text = (o, len) => {
      const t = ascii(b, o, 4);
      if (t === "desc") return zstr(b.subarray(o + 12, o + 12 + Math.min(u32be(b, o + 8), len)));
      if (t === "mluc") { const l = u32be(b, o + 20), off = u32be(b, o + 24); return utf16(b.subarray(o + off, o + off + l), false); }
      if (t === "text") return zstr(b.subarray(o + 8, o + len));
      return "";
    };
    for (let k = 0; k < n; k++) {
      const e = 132 + k * 12; if (e + 12 > b.length) break;
      const tag = ascii(b, e, 4), off = u32be(b, e + 4), len = u32be(b, e + 8); if (off + len > b.length) continue;
      try { if (tag === "desc") out.desc = text(off, len); else if (tag === "cprt") out.copyright = text(off, len); } catch { /* ignore */ }
    }
    return out;
  }

  /* ---------- XMP ---------- */
  const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
  function parseXmp(xml) {
    const props = {};
    const body = xml.replace(/<\?xpacket[\s\S]*?\?>/g, "").replace(/^[^<]+/, "").trim();
    let doc = null;
    try { doc = new DOMParser().parseFromString(body, "application/xml"); if (doc.getElementsByTagName("parsererror").length) doc = null; } catch { doc = null; }
    if (!doc) { // XML غير سليم: نقرأ السمات فقط
      const re = /([A-Za-z][\w-]*:[\w-]+)\s*=\s*"([^"]*)"/g; let m;
      while ((m = re.exec(xml))) if (!/^(xmlns|rdf|xml|x):/.test(m[1]) && !(m[1] in props)) props[m[1]] = m[2];
      return props;
    }
    const attrs = (el) => { const o = {}; for (const a of el.attributes) { if (a.prefix === "xmlns" || a.name === "xmlns" || a.prefix === "xml" || (a.namespaceURI === RDF && /^(about|parseType|ID|nodeID)$/.test(a.localName))) continue; o[a.name] = a.value; } return o; };
    const kidsOf = (el) => { const o = {}; for (const c of el.children) add(o, c.nodeName, val(c)); return o; };
    const add = (o, k, v) => { if (v === "" || v == null) return; if (o[k] == null) o[k] = v; else if (Array.isArray(o[k]) && Array.isArray(v)) o[k] = o[k].concat(v); };
    const val = (el) => {
      const kids = [...el.children];
      if (!kids.length) { const a = attrs(el); if (a["rdf:resource"]) return a["rdf:resource"]; return Object.keys(a).length ? a : el.textContent.trim(); }
      const k = kids[0];
      if (k.namespaceURI === RDF && /^(Seq|Bag|Alt)$/.test(k.localName)) {
        const lis = [...k.children].filter((li) => li.localName === "li");
        if (k.localName === "Alt") { const d = lis.find((li) => li.getAttribute("xml:lang") === "x-default") || lis[0]; return d ? val(d) : ""; }
        return lis.map(val).filter((x) => x !== "");
      }
      if (k.namespaceURI === RDF && k.localName === "Description") return { ...attrs(k), ...kidsOf(k) };
      return { ...attrs(el), ...kidsOf(el) };
    };
    for (const d of doc.getElementsByTagNameNS(RDF, "Description")) {
      if (!d.parentNode || d.parentNode.namespaceURI !== RDF || d.parentNode.localName !== "RDF") continue;
      const a = attrs(d); for (const k in a) add(props, k, a[k]);
      for (const c of d.children) add(props, c.nodeName, val(c));
    }
    return props;
  }
  const xmpText = (v, depth = 0) => {
    if (v == null) return "";
    if (Array.isArray(v)) return v.map((x) => xmpText(x, depth + 1)).join(depth ? " / " : "، ");
    if (typeof v === "object") return Object.entries(v).map(([k, x]) => `${k.replace(/^[^:]*:/, "")}: ${xmpText(x, depth + 1)}`).join("؛ ");
    return String(v);
  };
  function xmpCoord(s) {
    if (s == null) return null; s = String(s).trim();
    let m = /^(\d+),(\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?))?([NSEW])$/i.exec(s);
    if (m) { const v = +m[1] + +m[2] / 60 + (m[3] ? +m[3] / 3600 : 0); return /[SW]/i.test(m[4]) ? -v : v; }
    m = /^([+-]?\d+(?:\.\d+)?)([NSEW])?$/i.exec(s);
    if (m) { const v = +m[1]; return m[2] && /[SW]/i.test(m[2]) ? -Math.abs(v) : v; }
    return null;
  }
  const HIST_ACT = { created: "إنشاء", saved: "حفظ", converted: "تحويل صيغة", derived: "اشتقاق من ملف آخر", edited: "تعديل", cropped: "قصّ", resized: "تغيير حجم", copied: "نسخ", printed: "طباعة", published: "نشر", "version-updated": "تحديث نسخة", managed: "إدارة", produced: "إنتاج", formatted: "تنسيق", filtered: "فلتر", rated: "تقييم" };
  function findPersons(v, out, inRegion) {
    if (Array.isArray(v)) v.forEach((x) => findPersons(x, out, inRegion));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) {
      const reg = inRegion || /Region|PersonInImage/i.test(k);
      if (reg && /:(Name|PersonDisplayName)$/.test(k) && typeof x === "string") { if (!out.includes(x)) out.push(x); } else findPersons(x, out, reg);
    }
  }

  /* ---------- تعرّف الصيغة ---------- */
  const KINDS = {
    jpeg: ["صورة JPEG", "image/jpeg", /^(jpe?g|jfif|jpe)$/], png: ["صورة PNG", "image/png", /^(png|apng)$/], webp: ["صورة WebP", "image/webp", /^webp$/], gif: ["صورة GIF", "image/gif", /^gif$/],
    tiff: ["صورة TIFF", "image/tiff", /^(tiff?|dng|nef|cr2|arw|orf|rw2|pef)$/], heic: ["صورة HEIC / HEIF", "image/heic", /^(heic|heif|hif)$/], avif: ["صورة AVIF", "image/avif", /^avif$/], bmp: ["صورة BMP", "image/bmp", /^(bmp|dib)$/],
    mp4: ["فيديو MP4", "video/mp4", /^(mp4|m4v|3gp|3g2|m4a)$/], mov: ["فيديو QuickTime", "video/quicktime", /^(mov|qt)$/], pdf: ["مستند PDF", "application/pdf", /^pdf$/], other: ["ملف غير معروف", "", /^$/]
  };
  function sniff(d) {
    if (d[0] === 0xFF && d[1] === 0xD8 && d[2] === 0xFF) return "jpeg";
    if (d[0] === 0x89 && ascii(d, 1, 3) === "PNG") return "png";
    if (ascii(d, 0, 4) === "RIFF" && ascii(d, 8, 4) === "WEBP") return "webp";
    if (/^GIF8[79]a/.test(ascii(d, 0, 6))) return "gif";
    if (ascii(d, 0, 5) === "%PDF-") return "pdf";
    const t = ascii(d, 4, 4);
    if (t === "ftyp") { const b = ascii(d, 8, 4); if (/^avi[fs]/.test(b)) return "avif"; if (/^(hei[cxms]|hev[cxms]|mif1|msf1)/.test(b)) return "heic"; return /^qt/.test(b) ? "mov" : "mp4"; }
    if (/^(moov|mdat|wide|free|skip|pnot)$/.test(t)) return "mov";
    if ((d[0] === 0x49 && d[1] === 0x49 && d[2] === 0x2A) || (d[0] === 0x4D && d[1] === 0x4D && d[3] === 0x2A)) return "tiff";
    if (d[0] === 0x42 && d[1] === 0x4D) return "bmp";
    return "other";
  }

  /* ---------- JPEG ---------- */
  const SOF_NAME = { 0xC0: "Baseline", 0xC1: "Extended", 0xC2: "Progressive (تدريجي)", 0xC3: "Lossless", 0xC9: "Arithmetic", 0xCA: "Progressive Arithmetic" };
  function scanJpeg(d, F) {
    let i = 2, eoi = -1, lumaSum = 0, mpf = 0; const xmpExt = [], icc = [], app13 = [];
    const S = (name, size, note) => F.structure.push({ name, size, note: note || "" });
    while (i + 2 <= d.length) {
      if (d[i] !== 0xFF) { F.notes.push("بنية JPEG غير سليمة: بايت غير متوقع بين المقاطع."); break; }
      const m = d[i + 1];
      if (m === 0xFF) { i++; continue; }
      if (m === 0xD9) { eoi = i + 2; break; }
      if (m === 0x01 || (m >= 0xD0 && m <= 0xD8)) { i += 2; continue; }
      if (i + 4 > d.length) break;
      const len = u16be(d, i + 2);
      if (len < 2 || i + 2 + len > d.length) { F.truncated = true; break; }
      const b = d.subarray(i + 4, i + 2 + len), id = ascii(b, 0, 40);
      if (m === 0xE0) {
        if (id.startsWith("JFIF")) { F.jfif = { version: `${b[5]}.${pad(b[6])}`, units: b[7], x: u16be(b, 8), y: u16be(b, 10), tw: b[12], th: b[13] }; S("APP0 · JFIF", len, "ترويسة JFIF"); }
        else if (id.startsWith("JFXX")) { S("APP0 · JFXX", len, "صورة مصغّرة JFIF"); if (b[5] === 0x10) F.thumbs.push({ src: "JFXX", bytes: b.subarray(6) }); }
        else S("APP0", len, id.replace(/[^\x20-\x7E]/g, "").slice(0, 12));
      } else if (m === 0xE1) {
        if (id.startsWith("Exif\0")) { F.exifBlocks++; if (!F.tiff) F.tiff = b.subarray(6); S("APP1 · EXIF", len, "بيانات الكاميرا"); }
        else if (id.startsWith("http://ns.adobe.com/xap/1.0/\0")) { F.xmp.push(utf8(b.subarray(29))); S("APP1 · XMP", len, "بيانات Adobe XMP"); }
        else if (id.startsWith("http://ns.adobe.com/xmp/extension/\0")) { xmpExt.push({ off: u32be(b, 71), data: b.subarray(75) }); S("APP1 · XMP ممتد", len, ""); }
        else S("APP1", len, id.replace(/[^\x20-\x7E]/g, "").slice(0, 16));
      } else if (m === 0xE2) {
        if (id.startsWith("ICC_PROFILE\0")) { icc.push({ n: b[12], data: b.subarray(14) }); S("APP2 · ICC", len, "ملف الألوان"); }
        else if (id.startsWith("MPF\0")) { const t = parseTiff(b.subarray(4)); mpf = t && t.ifd0.Tag_0xB001 ? t.ifd0.Tag_0xB001.v : 2; F.mpf = mpf; S("APP2 · MPF", len, `ملف متعدد الصور (${mpf} صور)`); }
        else S("APP2", len, id.replace(/[^\x20-\x7E]/g, "").slice(0, 16));
      } else if (m === 0xEB) { const c = /c2pa/i.test(latin1(b)); if (c || id.startsWith("JP")) { F.c2paSize += len; S("APP11 · JUMBF", len, c ? "بيانات اعتماد المحتوى C2PA" : "حاوية JUMBF"); } else S("APP11", len, ""); }
      else if (m === 0xEC && id.startsWith("Ducky")) { let p = 5; while (p + 4 <= b.length) { const t = u16be(b, p), l = u16be(b, p + 2); if (!t) break; if (t === 1 && l === 4) F.ducky = u32be(b, p + 4); p += 4 + l; } if (F.ducky == null) F.ducky = -1; S("APP12 · Ducky", len, "أثر «حفظ للويب» في فوتوشوب"); }
      else if (m === 0xED) { app13.push(b); S("APP13 · Photoshop", len, "موارد فوتوشوب / IPTC"); }
      else if (m === 0xEE && id.startsWith("Adobe")) { F.adobe = { transform: b[11] }; S("APP14 · Adobe", len, "معلومات ترميز الألوان"); }
      else if (m >= 0xE0 && m <= 0xEF) S(`APP${m - 0xE0}`, len, id.replace(/[^\x20-\x7E]/g, "").slice(0, 16));
      else if (m === 0xFE) { const c = zstr(b); if (c) F.comments.push(c); S("COM", len, "تعليق نصي"); }
      else if (m === 0xDB) { let p = 0; while (p < b.length) { const pq = b[p] >> 4, tq = b[p] & 15, n = pq ? 128 : 64; if (tq === 0 && !lumaSum) { for (let k = 0; k < 64; k++) lumaSum += pq ? u16be(b, p + 1 + k * 2) : b[p + 1 + k]; } p += 1 + n; } }
      else if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
        F.image.w = u16be(b, 3); F.image.h = u16be(b, 1); F.image.bits = b[0]; F.image.components = b[5]; F.image.encoding = SOF_NAME[m] || "JPEG";
        if (b[5] >= 3) { const h = b[7] >> 4, v = b[7] & 15; F.image.subsampling = h === 1 && v === 1 ? "4:4:4 (بلا تقليل)" : h === 2 && v === 1 ? "4:2:2" : h === 2 && v === 2 ? "4:2:0" : `${h}x${v}`; }
      }
      i += 2 + len;
      if (m === 0xDA) { // بيانات الصورة المضغوطة: نقفز إلى المقطع التالي
        let p = i;
        for (;;) { p = d.indexOf(0xFF, p); if (p < 0 || p + 1 >= d.length) { p = -1; break; } const n = d[p + 1]; if (n === 0 || (n >= 0xD0 && n <= 0xD7)) { p += 2; continue; } if (n === 0xFF) { p++; continue; } break; }
        if (p < 0) { F.truncated = true; i = d.length; break; }
        i = p;
      }
    }
    if (lumaSum) { const s = (lumaSum * 100) / 3688; F.image.quality = Math.max(1, Math.min(100, Math.round(s <= 100 ? (200 - s) / 2 : 5000 / s))); }
    if (icc.length) { icc.sort((a, b) => a.n - b.n); F.icc = concat(icc.map((x) => x.data)); }
    if (xmpExt.length) { xmpExt.sort((a, b) => a.off - b.off); F.xmp.push(utf8(concat(xmpExt.map((x) => x.data)))); }
    if (app13.length) parseIRB(concat(app13), F);
    if (eoi < 0) F.truncated = true;
    else if (d.length - eoi > 0) trailer(d, eoi, F, mpf);
    if (F.truncated) F.notes.push("الملف مبتور أو تالف: لم نصل إلى علامة نهاية الصورة.");
  }
  function trailer(d, off, F, mpf) {
    const rest = d.subarray(off); if (!rest.some((x) => x !== 0)) return;
    const head = latin1(rest.subarray(0, Math.min(rest.length, 4096))), tail = latin1(rest.subarray(Math.max(0, rest.length - 4096)));
    let what = "بيانات مجهولة", video = false;
    if (/ftyp(mp4|isom|qt|MSNV|avc)/.test(head) || /MotionPhoto_Data/.test(head + tail)) { what = "فيديو مضمّن (صورة متحركة Motion Photo)"; video = true; }
    else if (rest[0] === 0xFF && rest[1] === 0xD8) what = mpf ? `صور إضافية مضمّنة (${Math.max(1, mpf - 1)}): معاينة أو خريطة عمق أو خريطة HDR` : "صورة JPEG ثانية ملحقة";
    else if (/SEFT$/.test(tail) || /SEFH/.test(tail)) what = "ذيل بيانات سامسونغ (SEF)";
    else if (head.startsWith("PK\x03\x04")) what = "أرشيف ZIP ملحق";
    else if (/^(Rar!|7z\xBC\xAF)/.test(head)) what = "أرشيف مضغوط ملحق";
    F.trailing = { offset: off, size: rest.length, what, video };
    F.structure.push({ name: "بعد نهاية الصورة", size: rest.length, note: what });
  }
  function concat(parts) { const len = parts.reduce((a, p) => a + p.length, 0), out = new Uint8Array(len); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; }

  /* ---------- PNG ---------- */
  const PNG_NOTE = { IHDR: "ترويسة الصورة", PLTE: "لوحة الألوان", IDAT: "بيانات الصورة", IEND: "نهاية الملف", tEXt: "نص", zTXt: "نص مضغوط", iTXt: "نص دولي (UTF-8)", eXIf: "EXIF", tIME: "وقت آخر تعديل", pHYs: "الدقة", gAMA: "غاما", cHRM: "إحداثيات الألوان", sRGB: "فضاء sRGB", iCCP: "ملف ألوان ICC", bKGD: "لون الخلفية", tRNS: "شفافية", sBIT: "البتات الفعلية", acTL: "ترويسة الحركة (APNG)", fcTL: "إطار حركة", fdAT: "بيانات إطار", caBX: "بيانات اعتماد المحتوى C2PA", cICP: "ترميز الألوان", orNT: "الاتجاه", iDOT: "علامة أبل (لقطة شاشة macOS / iOS)", CgBI: "صيغة أبل iOS" };
  const PNG_COLOR = { 0: "رمادي", 2: "RGB", 3: "لوحة ألوان", 4: "رمادي مع شفافية", 6: "RGB مع شفافية" };
  async function scanPng(d, F) {
    let i = 8; const counts = {}; let ended = false;
    const rawProfile = (key, text) => {
      const lines = text.trim().split("\n"); const h = lines.slice(2).join("").replace(/\s+/g, "");
      if (!/^[0-9a-f]+$/i.test(h)) return false;
      const b = new Uint8Array(h.length >> 1); for (let k = 0; k < b.length; k++) b[k] = parseInt(h.substr(k * 2, 2), 16);
      if (/exif|app1/i.test(key)) { if (ascii(b, 0, 5) === "Exif\0") { if (!F.tiff) F.tiff = b.subarray(6); } else if (/^http:\/\/ns\.adobe/.test(ascii(b, 0, 20))) F.xmp.push(utf8(b.subarray(29))); else if (!F.tiff) F.tiff = b; }
      else if (/xmp/i.test(key)) F.xmp.push(utf8(b)); else if (/iptc|8bim/i.test(key)) { if (ascii(b, 0, 4) === "8BIM" || ascii(b, 0, 9) === "Photoshop") parseIRB(b, F); else F.iptc = b; } else if (/icc|icm/i.test(key)) F.icc = b;
      return true;
    };
    const text = (key, value, type, lang) => {
      key = key.trim(); if (!key) return;
      if (/^XML:com\.adobe\.xmp$/i.test(key)) { F.xmp.push(value); return; }
      if (/^Raw profile type /i.test(key) && rawProfile(key, value)) return;
      F.texts.push({ key, value, type, lang: lang || "" });
    };
    while (i + 12 <= d.length) {
      const len = u32be(d, i), type = ascii(d, i + 4, 4);
      if (i + 12 + len > d.length) { F.truncated = true; break; }
      const b = d.subarray(i + 8, i + 8 + len); counts[type] = (counts[type] || 0) + 1;
      if (type !== "IDAT" && type !== "fdAT" && type !== "fcTL") F.structure.push({ name: type, size: len, note: PNG_NOTE[type] || (type[0] >= "a" ? (type[1] >= "a" ? "قطعة خاصة غير قياسية" : "") : "") });
      if (type === "IHDR") { F.image.w = u32be(b, 0); F.image.h = u32be(b, 4); F.image.bits = b[8]; F.image.color = PNG_COLOR[b[9]] || String(b[9]); F.image.interlace = b[12] ? "Adam7 (متشابك)" : "غير متشابك"; }
      else if (type === "tEXt") { const z = b.indexOf(0); if (z > 0) text(latin1(b.subarray(0, z)), utf8(b.subarray(z + 1)), "tEXt"); }
      else if (type === "zTXt") { const z = b.indexOf(0); if (z > 0) { const t = await inflate(b.subarray(z + 2)); if (t) text(latin1(b.subarray(0, z)), utf8(t), "zTXt"); } }
      else if (type === "iTXt") {
        const z = b.indexOf(0); if (z > 0) { const comp = b[z + 1]; const l1 = b.indexOf(0, z + 3), l2 = b.indexOf(0, l1 + 1); if (l1 > 0 && l2 > 0) { let t = b.subarray(l2 + 1); if (comp === 1) t = (await inflate(t)) || new Uint8Array(0); text(latin1(b.subarray(0, z)), utf8(t), "iTXt", latin1(b.subarray(z + 3, l1))); } }
      }
      else if (type === "eXIf") { if (!F.tiff) F.tiff = ascii(b, 0, 5) === "Exif\0" ? b.subarray(6) : b; F.exifBlocks++; }
      else if (type === "tIME" && len >= 7) F.pngTime = Date.UTC(u16be(b, 0), b[2] - 1, b[3], b[4], b[5], b[6]);
      else if (type === "pHYs" && len >= 9) F.image.dpi = b[8] === 1 ? Math.round(u32be(b, 0) * 0.0254) : null;
      else if (type === "gAMA") F.image.gamma = +(100000 / u32be(b, 0)).toFixed(2);
      else if (type === "sRGB") F.image.srgb = true;
      else if (type === "iCCP") { const z = b.indexOf(0); if (z > 0) { const p = await inflate(b.subarray(z + 2)); if (p) F.icc = p; F.iccName = latin1(b.subarray(0, z)); } }
      else if (type === "acTL") F.image.frames = u32be(b, 0);
      else if (type === "caBX") F.c2paSize += len;
      i += 12 + len;
      if (type === "IEND") { ended = true; break; }
    }
    if (counts.IDAT) F.structure.push({ name: "IDAT", size: 0, note: `بيانات الصورة (${counts.IDAT} قطعة)` });
    if (!ended) { F.truncated = true; F.notes.push("ملف PNG مبتور: لا توجد قطعة النهاية IEND."); }
    else if (d.length - i > 0 && d.subarray(i).some((x) => x !== 0)) { const rest = d.subarray(i); F.trailing = { offset: i, size: rest.length, what: rest[0] === 0x50 && rest[1] === 0x4B ? "أرشيف ZIP ملحق" : "بيانات مجهولة", video: false }; F.structure.push({ name: "بعد نهاية الصورة", size: rest.length, note: F.trailing.what }); }
  }

  /* ---------- WebP ---------- */
  function scanWebp(d, F) {
    let i = 12; const riffEnd = Math.min(d.length, 8 + u32le(d, 4)); let frames = 0;
    const NOTE = { VP8X: "ترويسة ممتدة", "VP8 ": "صورة (ضغط مع فقد)", VP8L: "صورة (ضغط بلا فقد)", ALPH: "قناة الشفافية", ANIM: "إعدادات الحركة", ANMF: "إطار حركة", ICCP: "ملف ألوان ICC", EXIF: "EXIF", "XMP ": "XMP", C2PA: "بيانات اعتماد المحتوى C2PA" };
    while (i + 8 <= riffEnd) {
      const type = ascii(d, i, 4), size = u32le(d, i + 4), b = d.subarray(i + 8, Math.min(d.length, i + 8 + size));
      if (type === "ANMF") frames++; else F.structure.push({ name: type.trim(), size, note: NOTE[type] || "قطعة غير قياسية" });
      if (type === "VP8X") { F.image.w = 1 + (b[4] | (b[5] << 8) | (b[6] << 16)); F.image.h = 1 + (b[7] | (b[8] << 8) | (b[9] << 16)); F.image.alpha = !!(b[0] & 0x10); if (b[0] & 2) F.image.animated = true; }
      else if (type === "VP8 " && !F.image.w && b[3] === 0x9D) { F.image.w = (b[6] | (b[7] << 8)) & 0x3FFF; F.image.h = (b[8] | (b[9] << 8)) & 0x3FFF; F.image.encoding = "مع فقد (VP8)"; }
      else if (type === "VP8L" && b[0] === 0x2F) { const n = u32le(b, 1); if (!F.image.w) { F.image.w = 1 + (n & 0x3FFF); F.image.h = 1 + ((n >> 14) & 0x3FFF); } F.image.encoding = "بلا فقد (VP8L)"; }
      else if (type === "EXIF") { F.exifBlocks++; if (!F.tiff) F.tiff = ascii(b, 0, 5) === "Exif\0" ? b.subarray(6) : b; }
      else if (type === "XMP ") F.xmp.push(utf8(b));
      else if (type === "ICCP") F.icc = b;
      else if (type === "C2PA") F.c2paSize += size;
      if (type === "VP8 " && !F.image.encoding) F.image.encoding = "مع فقد (VP8)";
      i += 8 + size + (size & 1);
    }
    if (frames) { F.image.frames = frames; F.structure.push({ name: "ANMF", size: 0, note: `${frames} إطار حركة` }); }
    if (d.length > riffEnd + 1 && d.subarray(riffEnd).some((x) => x !== 0)) { F.trailing = { offset: riffEnd, size: d.length - riffEnd, what: "بيانات مجهولة", video: false }; F.structure.push({ name: "بعد نهاية الصورة", size: d.length - riffEnd, note: "بيانات مجهولة" }); }
  }

  /* ---------- GIF ---------- */
  function scanGif(d, F) {
    F.image.w = d[6] | (d[7] << 8); F.image.h = d[8] | (d[9] << 8); F.image.encoding = ascii(d, 0, 6);
    let p = 13; if (d[10] & 0x80) p += 3 * (1 << ((d[10] & 7) + 1));
    let frames = 0, ended = false;
    const sub = (start) => { let q = start; const parts = []; while (q < d.length && d[q]) { parts.push(d.subarray(q + 1, q + 1 + d[q])); q += 1 + d[q]; } return { end: q + 1, data: parts }; };
    while (p < d.length) {
      const b = d[p];
      if (b === 0x3B) { ended = true; p++; break; }
      if (b === 0x2C) { const packed = d[p + 9]; p += 10; if (packed & 0x80) p += 3 * (1 << ((packed & 7) + 1)); p++; p = sub(p).end; frames++; continue; }
      if (b === 0x21) {
        const label = d[p + 1];
        if (label === 0xFE) { const s = sub(p + 2); const c = utf8(concat(s.data)).trim(); if (c) F.comments.push(c); F.structure.push({ name: "Comment", size: s.end - p, note: "تعليق نصي" }); p = s.end; continue; }
        if (label === 0xFF) {
          const id = ascii(d, p + 3, 11), start = p + 14; const s = sub(start);
          if (id === "XMP DataXMP") { const raw = latin1(d.subarray(start, s.end)); const e = raw.indexOf("</x:xmpmeta>"); if (e > 0) F.xmp.push(utf8(d.subarray(start, start + e + 12))); }
          else if (/^(NETSCAPE2\.0|ANIMEXTS1\.0)$/.test(id)) { const a = concat(s.data); if (a[0] === 1) F.image.loops = a[1] | (a[2] << 8); }
          else if (id === "ICCRGBG1012") F.icc = concat(s.data);
          F.structure.push({ name: `Application · ${id.replace(/[^\x20-\x7E]/g, "")}`, size: s.end - p, note: id === "XMP DataXMP" ? "XMP" : /NETSCAPE|ANIMEXTS/.test(id) ? "تكرار الحركة" : "امتداد تطبيق" });
          p = s.end; continue;
        }
        p = sub(p + 2).end; continue;
      }
      break;
    }
    F.image.frames = frames;
    if (!ended) F.truncated = true;
    else if (d.length - p > 0 && d.subarray(p).some((x) => x !== 0)) { F.trailing = { offset: p, size: d.length - p, what: "بيانات مجهولة", video: false }; F.structure.push({ name: "بعد نهاية الصورة", size: d.length - p, note: "بيانات مجهولة" }); }
  }

  /* ---------- ISO-BMFF (HEIC / AVIF / MP4 / MOV) ---------- */
  function* boxes(d, start, end) {
    let p = start;
    while (p + 8 <= end) {
      let size = u32be(d, p), hdr = 8; const type = ascii(d, p + 4, 4);
      if (size === 1) { if (p + 16 > end) return; size = u32be(d, p + 8) * 4294967296 + u32be(d, p + 12); hdr = 16; } else if (size === 0) size = end - p;
      if (size < hdr || p + size > end) return;
      yield { type, s: p + hdr, e: p + size, size };
      p += size;
    }
  }
  const AUX = { "urn:mpeg:hevc:2015:auxid:1": "قناة شفافية", "urn:mpeg:hevc:2015:auxid:2": "خريطة عمق (صورة بورتريه)", "urn:mpeg:mpegB:cicp:systems:auxiliary:alpha": "قناة شفافية", "urn:com:apple:photo:2020:aux:hdrgainmap": "خريطة HDR (أبل)", "urn:com:apple:photo:2018:aux:portraiteffectsmatte": "قناع بورتريه (أبل)", "urn:com:apple:photo:2019:aux:semanticskinmatte": "قناع بشرة (أبل)", "urn:com:apple:photo:2019:aux:semantichairmatte": "قناع شعر (أبل)" };
  function scanHeif(d, F) {
    const items = {}, locs = {}; let idat = null;
    for (const b of boxes(d, 0, d.length)) {
      F.structure.push({ name: b.type, size: b.size, note: { ftyp: `نوع الملف: ${ascii(d, b.s, 4)}`, meta: "الميتاداتا وفهرس العناصر", mdat: "بيانات الصور المضغوطة", moov: "فيديو مرافق", free: "فراغ", uuid: "صندوق خاص", jumb: "حاوية JUMBF (C2PA)" }[b.type] || "" });
      if (b.type === "ftyp") F.image.brand = ascii(d, b.s, 4);
      if (b.type === "jumb") F.c2paSize += b.size;
      if (b.type !== "meta") continue;
      for (const m of boxes(d, b.s + 4, b.e)) {
        if (m.type === "idat") idat = m;
        else if (m.type === "iinf") {
          const ver = d[m.s]; const start = m.s + 4 + (ver === 0 ? 2 : 4);
          for (const e of boxes(d, start, m.e)) {
            if (e.type !== "infe") continue; const v = d[e.s]; if (v < 2) continue;
            let p = e.s + 4; const id = v === 2 ? u16be(d, p) : u32be(d, p); p += (v === 2 ? 2 : 4) + 2;
            const type = ascii(d, p, 4); p += 4; const z = d.indexOf(0, p); let ctype = "";
            if (type === "mime" && z >= 0 && z < e.e) ctype = zstr(d.subarray(z + 1, e.e));
            items[id] = { type, ctype };
          }
        } else if (m.type === "iloc") {
          const ver = d[m.s]; let p = m.s + 4; const os = d[p] >> 4, ls = d[p] & 15, bs = d[p + 1] >> 4, is = ver ? d[p + 1] & 15 : 0; p += 2;
          const rd = (n) => { let v = 0; for (let k = 0; k < n; k++) v = v * 256 + d[p + k]; p += n; return v; };
          const count = ver < 2 ? rd(2) : rd(4);
          for (let k = 0; k < count && p < m.e; k++) {
            const id = ver < 2 ? rd(2) : rd(4); const method = ver ? rd(2) & 15 : 0; rd(2); const base = rd(bs); const n = rd(2); const ext = [];
            for (let x = 0; x < n; x++) { if (is) rd(is); const o = rd(os), l = rd(ls); ext.push([base + o, l]); }
            locs[id] = { method, ext };
          }
        } else if (m.type === "iprp") {
          for (const c of boxes(d, m.s, m.e)) if (c.type === "ipco") for (const pr of boxes(d, c.s, c.e)) {
            if (pr.type === "ispe") { const w = u32be(d, pr.s + 4), h = u32be(d, pr.s + 8); if (w * h > (F.image.w || 0) * (F.image.h || 0)) { F.image.w = w; F.image.h = h; } }
            else if (pr.type === "irot") F.image.rotation = (d[pr.s] & 3) * 90;
            else if (pr.type === "colr") { const t = ascii(d, pr.s, 4); if ((t === "prof" || t === "rICC") && !F.icc) F.icc = d.subarray(pr.s + 4, pr.e); }
            else if (pr.type === "auxC") { const u = zstr(d.subarray(pr.s + 4, pr.e)); if (u && !F.aux.includes(AUX[u] || u)) F.aux.push(AUX[u] || u); }
            else if (pr.type === "pixi") F.image.bits = d[pr.s + 5];
          }
        }
      }
    }
    const data = (id) => {
      const l = locs[id]; if (!l) return null; const parts = [];
      for (const [o, len] of l.ext) { const base = l.method === 1 && idat ? idat.s + o : o; if (base + len > d.length) return null; parts.push(d.subarray(base, base + len)); }
      return parts.length === 1 ? parts[0] : concat(parts);
    };
    const kinds = {};
    for (const id in items) {
      const it = items[id]; kinds[it.type] = (kinds[it.type] || 0) + 1;
      try {
        if (it.type === "Exif") { const b = data(id); if (b && b.length > 8) { F.exifBlocks++; if (!F.tiff) F.tiff = b.subarray(4 + u32be(b, 0)); } }
        else if (it.type === "mime" && /rdf\+xml|xmp/i.test(it.ctype)) { const b = data(id); if (b) F.xmp.push(utf8(b)); }
      } catch { /* عنصر تالف */ }
    }
    const k = Object.entries(kinds).map(([t, n]) => `${t.trim()}×${n}`).join("، ");
    if (k) F.structure.push({ name: "العناصر", size: 0, note: k });
    // احتياط: لو فشل فهرس العناصر نبحث عن EXIF و XMP نصياً
    if (!F.tiff || !F.xmp.length) {
      const raw = latin1(d.subarray(0, Math.min(d.length, 4000000)));
      if (!F.tiff) { const e = raw.search(/Exif\0\0(II\*\0|MM\0\*)/); if (e >= 0) { F.tiff = d.subarray(e + 6, Math.min(d.length, e + 300000)); F.exifBlocks++; } }
      if (!F.xmp.length) { const x = raw.match(/<x:xmpmeta[\s\S]*?<\/x:xmpmeta>/); if (x) F.xmp.push(utf8(d.subarray(x.index, x.index + x[0].length))); }
    }
  }

  const QT_EPOCH = Date.UTC(1904, 0, 1);
  function iso6709(s) { const m = /^\s*([+-]\d{1,2}(?:\.\d+)?)([+-]\d{1,3}(?:\.\d+)?)([+-]\d+(?:\.\d+)?)?/.exec(s || ""); return m ? { lat: +m[1], lon: +m[2], alt: m[3] != null ? +m[3] : null } : null; }
  const QT_KEYS = { "com.apple.quicktime.make": "Make", "com.apple.quicktime.model": "Model", "com.apple.quicktime.software": "Software", "com.apple.quicktime.creationdate": "qtCreationDate", "com.apple.quicktime.location.ISO6709": "location", "com.apple.quicktime.location.accuracy.horizontal": "accuracy", "com.apple.quicktime.content.identifier": "contentId", "com.android.version": "androidVersion", "com.android.manufacturer": "Make", "com.android.model": "Model", "com.android.capture.fps": "captureFps", "com.apple.quicktime.description": "description", "com.apple.quicktime.title": "title", "com.apple.quicktime.author": "author", "com.apple.quicktime.comment": "comment", "com.apple.quicktime.live-photo.auto": "livePhoto" };
  const UDTA = { "\xA9xyz": "location", "\xA9mak": "Make", "\xA9mod": "Model", "\xA9swr": "Software", "\xA9too": "encoder", "\xA9enc": "encoder", "\xA9day": "day", "\xA9nam": "title", "\xA9cmt": "comment", "\xA9ART": "author", "\xA9aut": "author", "\xA9des": "description", "\xA9cpy": "copyright", "\xA9fmt": "format", "\xA9inf": "info", "\xA9alb": "album", "desc": "description", "auth": "author", "titl": "title", "cprt": "copyright" };
  async function scanMp4(file, F) {
    const V = F.video = { tags: {}, tracks: [], brands: "" }; let pos = 0, moov = null, guard = 0;
    while (pos + 8 <= file.size && guard++ < 400) {
      const h = new Uint8Array(await file.slice(pos, pos + 16).arrayBuffer());
      let size = u32be(h, 0), hdr = 8; const type = ascii(h, 4, 4);
      if (size === 1) { size = u32be(h, 8) * 4294967296 + u32be(h, 12); hdr = 16; } else if (size === 0) size = file.size - pos;
      if (size < hdr || !/^[\x20-\x7E\xA9]{4}$/.test(type)) break;
      F.structure.push({ name: type, size, note: { ftyp: "نوع الملف", moov: "فهرس الفيديو والميتاداتا", mdat: "بيانات الصوت والصورة", free: "فراغ", wide: "فراغ", uuid: "صندوق خاص", moof: "جزء فيديو (مقطّع)", meta: "ميتاداتا" }[type] || "" });
      if (type === "ftyp") { const b = new Uint8Array(await file.slice(pos + 8, pos + Math.min(size, 64)).arrayBuffer()); V.brands = [ascii(b, 0, 4), ...(latin1(b.subarray(8)).match(/.{4}/g) || [])].map((x) => x.trim()).filter((x, i, a) => x && a.indexOf(x) === i).join("، "); }
      if (type === "moov" && size <= 96 * 1048576) moov = new Uint8Array(await file.slice(pos + hdr, pos + size).arrayBuffer());
      if (type === "uuid" && size < 4 * 1048576) { const b = new Uint8Array(await file.slice(pos + hdr, pos + size).arrayBuffer()); const s = latin1(b.subarray(16, 64)); if (/<\?xpacket|<x:xmpmeta/.test(s)) F.xmp.push(utf8(b.subarray(16))); }
      pos += size;
    }
    if (pos < file.size - 8 && guard < 400 && F.structure.length) F.notes.push("توقفت قراءة بنية الملف قبل نهايته (بنية غير متوقعة).");
    if (!moov) { F.notes.push("لم نجد فهرس الفيديو (moov)، فلا ميتاداتا تُقرأ. قد يكون الملف مقطّعاً أو مبتوراً."); return; }
    const d = moov; const T = V.tags;
    const set = (k, v) => { if (v != null && v !== "" && T[k] == null) T[k] = v; };
    const dataBox = (s, e) => { for (const b of boxes(d, s, e)) if (b.type === "data") { const t = u32be(d, b.s), body = d.subarray(b.s + 8, b.e); if (t === 1 || t === 0) return utf8(body).replace(/\0/g, "").trim(); if (t === 23 && body.length === 4) return new DataView(body.buffer, body.byteOffset, 4).getFloat32(0); if ((t === 21 || t === 22) && body.length <= 8) { let v = 0; for (const x of body) v = v * 256 + x; return v; } if (t === 2) return utf16(body, false); return null; } return null; };
    const meta = (s, e) => {
      // في MP4 صندوق meta يبدأ بأربعة بايتات إصدار، وفي QuickTime أحياناً لا
      if (ascii(d, s + 4, 4) !== "hdlr" && ascii(d, s + 8, 4) === "hdlr") s += 4;
      let keys = [];
      for (const b of boxes(d, s, e)) {
        if (b.type === "keys") { let p = b.s + 8; const n = u32be(d, b.s + 4); for (let k = 0; k < n && p + 8 <= b.e; k++) { const sz = u32be(d, p); keys.push(utf8(d.subarray(p + 8, p + sz))); p += sz; } }
        else if (b.type === "ilst") for (const it of boxes(d, b.s, b.e)) {
          const idx = u32be(d, it.s - 4); const v = dataBox(it.s, it.e); if (v == null) continue;
          const key = keys.length && idx >= 1 && idx <= keys.length ? keys[idx - 1] : it.type;
          set(QT_KEYS[key] || UDTA[key] || key, v);
        }
      }
    };
    const walk = (s, e, trak) => {
      for (const b of boxes(d, s, e)) {
        if (b.type === "mvhd") { const v = d[b.s]; const c = v ? u32be(d, b.s + 4) * 4294967296 + u32be(d, b.s + 8) : u32be(d, b.s + 4), m = v ? u32be(d, b.s + 12) * 4294967296 + u32be(d, b.s + 16) : u32be(d, b.s + 8); const ts = u32be(d, b.s + (v ? 20 : 12)), du = v ? u32be(d, b.s + 24) * 4294967296 + u32be(d, b.s + 28) : u32be(d, b.s + 16); if (c) V.created = QT_EPOCH + c * 1000; if (m) V.modified = QT_EPOCH + m * 1000; if (ts) V.duration = du / ts; }
        else if (b.type === "trak") { const t = {}; V.tracks.push(t); walk(b.s, b.e, t); }
        else if (b.type === "tkhd" && trak) { trak.w = u32be(d, b.e - 8) >>> 16; trak.h = u32be(d, b.e - 4) >>> 16; }
        else if (b.type === "hdlr" && trak) { if (!trak.handler) trak.handler = ascii(d, b.s + 8, 4); const n = zstr(d.subarray(b.s + 24, b.e)).replace(/^[\x00-\x1F]/, ""); if (n && !trak.name) trak.name = n; }
        else if (b.type === "stsd" && trak) trak.codec = ascii(d, b.s + 12, 4).trim();
        else if (b.type === "meta") meta(b.s, b.e);
        else if (b.type === "udta") {
          for (const u of boxes(d, b.s, b.e)) {
            if (u.type === "meta") { meta(u.s, u.e); continue; }
            const k = UDTA[u.type]; if (!k) { if (/^(SDLN|smrd|smta|Xtra|CNTH|CNDA|TAGS|GoPr|FIRM|LENS|CAME|MUID|HMMT)$/.test(u.type)) V.vendorBoxes = (V.vendorBoxes || []).concat(u.type); continue; }
            let v = null; const len = u16be(d, u.s);
            if (u.type.charCodeAt(0) === 0xA9 && len > 0 && u.s + 4 + len <= u.e) v = utf8(d.subarray(u.s + 4, u.s + 4 + len)); else v = dataBox(u.s, u.e) || zstr(d.subarray(u.s + 6, u.e));
            if (typeof v === "string") v = v.replace(/\0/g, "").trim();
            set(k, v);
          }
        }
        else if (/^(mdia|minf|stbl|edts)$/.test(b.type)) walk(b.s, b.e, trak);
      }
    };
    walk(0, d.length, null);
    const vt = V.tracks.find((t) => t.handler === "vide"); if (vt) { F.image.w = vt.w; F.image.h = vt.h; F.image.encoding = vt.codec; }
  }

  /* ---------- PDF ---------- */
  function pdfString(s, at) {
    while (/\s/.test(s[at])) at++;
    let bytes = [];
    if (s[at] === "(") {
      let depth = 1, i = at + 1;
      for (; i < s.length && depth; i++) {
        const c = s[i];
        if (c === "\\") { const n = s[++i]; const esc = { n: 10, r: 13, t: 9, b: 8, f: 12 }; if (n in esc) bytes.push(esc[n]); else if (/[0-7]/.test(n)) { let o = n; while (o.length < 3 && /[0-7]/.test(s[i + 1])) o += s[++i]; bytes.push(parseInt(o, 8) & 255); } else if (n === "\r" || n === "\n") { if (n === "\r" && s[i + 1] === "\n") i++; } else bytes.push(n.charCodeAt(0)); }
        else if (c === "(") { depth++; bytes.push(40); } else if (c === ")") { depth--; if (depth) bytes.push(41); } else bytes.push(c.charCodeAt(0));
      }
    } else if (s[at] === "<" && s[at + 1] !== "<") { const e = s.indexOf(">", at); const h = s.slice(at + 1, e).replace(/\s/g, ""); for (let i = 0; i + 1 < h.length; i += 2) bytes.push(parseInt(h.substr(i, 2), 16)); }
    else return null;
    const b = new Uint8Array(bytes);
    if (b[0] === 0xFE && b[1] === 0xFF) return utf16(b.subarray(2), false);
    if (b[0] === 0xFF && b[1] === 0xFE) return utf16(b.subarray(2), true);
    if (b[0] === 0xEF && b[1] === 0xBB) return utf8(b.subarray(3));
    return latin1(b).trim();
  }
  function pdfDate(s) { const m = /^D?:?(\d{4})(\d\d)?(\d\d)?(\d\d)?(\d\d)?(\d\d)?\s*(Z|[+-]\d\d'?:?\d\d)?/.exec(s || ""); if (!m) return null; return { wall: Date.UTC(+m[1], +(m[2] || 1) - 1, +(m[3] || 1), +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)), tz: m[7] ? tzMin(m[7].replace("'", ":").replace(/'$/, "")) : null, dateOnly: !m[4] }; }
  async function scanPdf(file, F) {
    const big = file.size > 24 * 1048576;
    const d = big ? concat([new Uint8Array(await file.slice(0, 8 * 1048576).arrayBuffer()), new Uint8Array(await file.slice(file.size - 8 * 1048576).arrayBuffer())]) : new Uint8Array(await file.arrayBuffer());
    const s = latin1(d); const P = F.pdf = { info: {} };
    if (big) F.notes.push("الملف كبير: قرأنا أوله وآخره فقط (16 م.ب).");
    P.version = (/%PDF-(\d\.\d)/.exec(s) || [])[1] || "";
    P.encrypted = /\/Encrypt\s*(\d+\s+\d+\s+R|<<)/.test(s);
    P.revisions = (s.match(/%%EOF/g) || []).length;
    P.pages = Math.max(0, ...[...s.matchAll(/\/Type\s*\/Pages\b[^]{0,300}?\/Count\s+(\d+)/g)].map((m) => +m[1]), ...[...s.matchAll(/\/Count\s+(\d+)[^]{0,300}?\/Type\s*\/Pages\b/g)].map((m) => +m[1]));
    P.linearized = /\/Linearized\s/.test(s.slice(0, 2048)); P.js = /\/(JavaScript|JS)\s/.test(s); P.objStm = /\/Type\s*\/ObjStm/.test(s);
    let dict = "";
    const refs = [...s.matchAll(/\/Info\s+(\d+)\s+(\d+)\s+R/g)];
    for (const r of refs.reverse()) { const m = new RegExp(`(?:^|[\\r\\n\\s])${r[1]}\\s+${r[2]}\\s+obj\\b([\\s\\S]*?)endobj`).exec(s); if (m) { dict = m[1]; break; } }
    if (!dict) { const m = /<<(?:(?!endobj)[\s\S]){0,4000}?\/(Producer|CreationDate|Author)\s*[(<](?:(?!endobj)[\s\S]){0,4000}?>>/.exec(s); if (m) dict = m[0]; }
    for (const k of ["Title", "Author", "Subject", "Keywords", "Creator", "Producer", "CreationDate", "ModDate", "Trapped", "Company", "SourceModified"]) {
      const m = new RegExp(`/${k}\\s*(?=[(<])`).exec(dict); if (!m) continue;
      const v = pdfString(dict, m.index + m[0].length); if (v) P.info[k] = v;
    }
    const x = s.lastIndexOf("<x:xmpmeta"); if (x >= 0) { const e = s.indexOf("</x:xmpmeta>", x); if (e > 0) F.xmp.push(utf8(d.subarray(x, e + 12))); }
    F.structure.push({ name: `PDF ${P.version}`, size: file.size, note: `${P.pages || "؟"} صفحة · ${P.revisions} مرحلة حفظ` });
  }

  /* ---------- تجميع التقرير ---------- */
  async function scan(file, opt = {}) {
    const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
    const kind = sniff(head);
    const ext = ((file.name || "").match(/\.([A-Za-z0-9]+)$/) || [])[1] || "";
    const F = { tiff: null, exifBlocks: 0, xmp: [], iptc: null, irb: [], icc: null, comments: [], texts: [], thumbs: [], structure: [], image: {}, jfif: null, notes: [], trailing: null, truncated: false, c2paSize: 0, aux: [], ducky: null, mpf: 0, pngTime: null };
    const R = {
      kind, kindLabel: KINDS[kind][0], mime: KINDS[kind][1], ext: ext.toLowerCase(), size: file.size, name: file.name || "",
      extMismatch: !!ext && kind !== "other" && !KINDS[kind][2].test(ext.toLowerCase()) && !(kind === "mp4" && /^mov$/i.test(ext)) && !(kind === "mov" && /^mp4$/i.test(ext)),
      rows: [], gps: null, dates: [], device: {}, tools: [], history: [], thumbs: [], orientation: 1, exifDims: null, makerNote: null, structure: F.structure,
      trailing: null, truncated: false, notes: F.notes, persons: [], motion: false, image: F.image, has: {}, xmp: {}, xmpRaw: "", iptc: {}, texts: [], comments: [], icc: null, pdf: null, video: null, ancestors: 0, crs: 0, aux: F.aux
    };
    let d = null;
    try {
      if (kind === "mp4" || kind === "mov") await scanMp4(file, F);
      else if (kind === "pdf") await scanPdf(file, F);
      else {
        if (file.size > 400 * 1048576) { F.notes.push("الملف أكبر من 400 م.ب، فلم نقرأه."); }
        else {
          d = opt.bytes || new Uint8Array(await file.arrayBuffer());
          if (kind === "jpeg") scanJpeg(d, F); else if (kind === "png") await scanPng(d, F); else if (kind === "webp") scanWebp(d, F); else if (kind === "gif") scanGif(d, F);
          else if (kind === "heic" || kind === "avif") scanHeif(d, F);
          else if (kind === "tiff") { F.tiff = d; F.exifBlocks = 1; }
          else if (kind === "bmp") { F.image.w = u32le(d, 18); F.image.h = Math.abs(u32le(d, 22) | 0); F.image.bits = d[28] | (d[29] << 8); }
        }
      }
    } catch (e) { F.notes.push("تعذّرت قراءة جزء من بنية الملف (ملف تالف أو صيغة غير معتادة)."); }

    const row = (sec, src, key, value, raw, sens) => { if (value === "" || value == null) return; const [label, help] = lab(key); R.rows.push({ sec, src, key, label, help, value: String(value), raw: raw === undefined ? value : raw, sens: !!sens }); };
    const addDate = (id, label, src, text, wall, tz, o = {}) => { if (wall == null || !isFinite(wall)) return; R.dates.push({ id, label, src, text: String(text), wall, tz: tz == null ? null : tz, utc: o.isUtc ? wall : tz == null ? null : wall - tz * 60000, dateOnly: !!o.dateOnly }); };
    const tool = (where, value) => { value = String(value || "").trim(); if (value && !R.tools.some((t) => t.where === where && t.value === value)) R.tools.push({ where, value }); };

    /* EXIF */
    let T = null;
    try { T = F.tiff ? parseTiff(F.tiff) : null; } catch { T = null; }
    if (F.tiff && !T) F.notes.push("يوجد مقطع EXIF لكنه تالف ولا يُقرأ.");
    if (T) {
      // TIFF قد يحمل XMP و IPTC و ICC داخل وسومه
      const emb = (n) => T.ifd0[n] && T.ifd0[n].v instanceof Uint8Array ? T.ifd0[n].v : null;
      if (emb("XMLPacket")) F.xmp.push(utf8(emb("XMLPacket")));
      if (T.ifd0["IPTC-NAA"] && !F.iptc) { const e = T.ifd0["IPTC-NAA"]; F.iptc = F.tiff.subarray(e.off, e.off + e.len); }
      if (emb("PhotoshopIRB")) parseIRB(emb("PhotoshopIRB"), F);
      if (emb("ICCProfile") && !F.icc) F.icc = emb("ICCProfile");
      if (T.thumb) F.thumbs.unshift({ src: "EXIF", bytes: T.thumb });
      if (T.errors) F.notes.push(`بعض حقول EXIF تالفة أو تشير خارج المقطع (${T.errors}). قد يدل ذلك على تعديل غير متقن للميتاداتا.`);
      const all = { ...T.ifd0, ...T.exif };
      for (const [name, e] of Object.entries(all)) {
        if (SKIP_EXIF.test(name)) continue;
        const v = fmtExif(name, e, all); if (v === "") continue;
        row(secOfExif(name), "EXIF", name, v, rawOf(e.v), SENS.test(name));
      }
      for (const [name, e] of Object.entries(T.interop)) row("image", "EXIF", name, fmtExif(name, e, T.interop), rawOf(e.v));
      const s = (n) => (all[n] && typeof all[n].v === "string" ? all[n].v.trim() : "");
      R.device = { make: s("Make"), model: s("Model"), lens: s("LensModel"), serial: s("BodySerialNumber"), lensSerial: s("LensSerialNumber"), owner: s("CameraOwnerName"), uniqueId: s("ImageUniqueID"), artist: s("Artist"), copyright: s("Copyright") };
      tool("EXIF Software", s("Software")); tool("EXIF HostComputer", s("HostComputer")); tool("EXIF ProcessingSoftware", s("ProcessingSoftware"));
      if (all.Orientation && typeof all.Orientation.v === "number" && all.Orientation.v >= 1 && all.Orientation.v <= 8) R.orientation = all.Orientation.v;
      if (all.ExifImageWidth && all.ExifImageHeight) R.exifDims = { w: +all.ExifImageWidth.v, h: +all.ExifImageHeight.v };
      if (all.MakerNote && all.MakerNote.v instanceof Uint8Array) {
        const b = all.MakerNote.v, sig = ascii(b, 0, 16); const hit = MN_SIG.find(([re]) => re.test(sig));
        R.makerNote = { size: b.length, vendor: hit ? hit[1] : "" };
        const r = R.rows.find((x) => x.key === "MakerNote"); if (r) r.value = `موجودة: ${bytesLabel(b.length)}${hit ? `، بصيغة ${hit[1]}` : ""}`;
      }
      if (kind === "tiff" && all.ImageWidth && all.ImageHeight) { F.image.w = +all.ImageWidth.v; F.image.h = +all.ImageHeight.v; }
      R.windowsEdit = !!(all.XPTitle || all.XPComment || all.XPAuthor || all.XPKeywords || all.XPSubject || all.Padding);
      R.exifComplete = ["ExposureTime", "FNumber", "ISO", "FocalLength"].filter((n) => all[n]).length;
      const dt = (id, n, label, tzN, sub) => { const w = wallFromExif(s(n)); if (w != null) addDate(id, label, "EXIF", s(n) + (s(sub) ? "." + s(sub) : ""), w, tzMin(s(tzN))); else if (s(n)) R.badDates = (R.badDates || []).concat(`${lab(n)[0]}: ${s(n)}`); };
      dt("original", "DateTimeOriginal", "الالتقاط", "OffsetTimeOriginal", "SubSecTimeOriginal");
      dt("digitized", "CreateDate", "الرقمنة", "OffsetTimeDigitized", "SubSecTimeDigitized");
      dt("modified", "ModifyDate", "آخر حفظ", "OffsetTime", "SubSecTime");
      /* GPS */
      const G = T.gps;
      if (Object.keys(G).length) {
        for (const [name, e] of Object.entries(G)) { if (SKIP_EXIF.test(name)) continue; row("gps", "EXIF", name, fmtExif(name, e, G), rawOf(e.v), SENS.test(name)); }
        const lat = G.GPSLatitude ? dms(G.GPSLatitude.v, G.GPSLatitudeRef && G.GPSLatitudeRef.v) : null, lon = G.GPSLongitude ? dms(G.GPSLongitude.v, G.GPSLongitudeRef && G.GPSLongitudeRef.v) : null;
        if (lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
          const num = (n) => (G[n] && typeof G[n].v === "number" ? G[n].v : null);
          R.gps = { lat, lon, alt: num("GPSAltitude") == null ? null : (G.GPSAltitudeRef && G.GPSAltitudeRef.v === 1 ? -1 : 1) * num("GPSAltitude"), dir: num("GPSImgDirection"), acc: num("GPSHPositioningError"), speed: num("GPSSpeed"), src: "EXIF", zero: Math.abs(lat) < 1e-6 && Math.abs(lon) < 1e-6 };
        } else if (G.GPSLatitude || G.GPSLongitude) F.notes.push("حقول GPS موجودة لكن قيمها غير صالحة.");
        const ds = G.GPSDateStamp && typeof G.GPSDateStamp.v === "string" ? G.GPSDateStamp.v : "", ts = G.GPSTimeStamp && Array.isArray(G.GPSTimeStamp.v) ? G.GPSTimeStamp.v : null;
        if (ds && ts) { const w = wallFromExif(`${ds} ${pad(Math.floor(ts[0] || 0))}:${pad(Math.floor(ts[1] || 0))}:${pad(Math.floor(ts[2] || 0))}`); addDate("gps", "وقت الأقمار الصناعية (GPS)", "GPS", `${ds} ${pad(Math.floor(ts[0] || 0))}:${pad(Math.floor(ts[1] || 0))}:${pad(Math.floor(ts[2] || 0))} UTC`, w, 0, { isUtc: true }); }
      }
    }

    /* IPTC */
    if (F.iptc) {
      try {
        R.iptc = parseIIM(F.iptc);
        for (const [k, vals] of Object.entries(R.iptc)) row(/Date|Time/.test(k) ? "time" : /Program/.test(k) ? "software" : "author", "IPTC", k, vals.join("، "), vals.length > 1 ? vals : vals[0], SENS.test(k));
        const I = (k) => (R.iptc[k] || [])[0] || "";
        if (I("OriginatingProgram")) tool("IPTC OriginatingProgram", `${I("OriginatingProgram")} ${I("ProgramVersion")}`.trim());
        const idate = (id, dk, tk, label) => { if (!I(dk)) return; const p = parseIso(`${I(dk).slice(0, 4)}-${I(dk).slice(4, 6)}-${I(dk).slice(6, 8)}` + (I(tk) ? `T${I(tk).slice(0, 2)}:${I(tk).slice(2, 4)}:${I(tk).slice(4, 6)}${I(tk).slice(6)}` : "")); if (p) addDate(id, label, "IPTC", `${I(dk)} ${I(tk)}`.trim(), p.wall, p.tz, { dateOnly: p.dateOnly }); };
        idate("iptc-created", "DateCreated", "TimeCreated", "إنشاء المحتوى"); idate("iptc-digitized", "DigitalCreationDate", "DigitalCreationTime", "الرقمنة");
      } catch { F.notes.push("تعذّرت قراءة مقطع IPTC."); }
    }

    /* XMP */
    R.xmpRaw = F.xmp.join("\n");
    for (const x of F.xmp) { try { const p = parseXmp(x); for (const k in p) if (!(k in R.xmp)) R.xmp[k] = p[k]; } catch { F.notes.push("تعذّرت قراءة مقطع XMP."); } }
    const X = R.xmp;
    if (Object.keys(X).length) {
      const hist = Array.isArray(X["xmpMM:History"]) ? X["xmpMM:History"] : X["xmpMM:History"] ? [X["xmpMM:History"]] : [];
      R.history = hist.filter((h) => h && typeof h === "object").map((h) => { const g = (n) => h[`stEvt:${n}`] || ""; const p = parseIso(g("when")); return { action: g("action"), actionAr: HIST_ACT[g("action")] || g("action") || "حدث", when: g("when"), wall: p ? p.wall : null, tz: p ? p.tz : null, agent: g("softwareAgent"), params: g("parameters"), changed: g("changed") }; });
      R.history.forEach((h) => tool("XMP History", h.agent));
      const anc = X["photoshop:DocumentAncestors"]; R.ancestors = Array.isArray(anc) ? anc.length : anc ? 1 : 0;
      R.crs = Object.keys(X).filter((k) => /^crs:/.test(k)).length;
      R.motion = /^1$/.test(String(X["GCamera:MotionPhoto"] || X["GCamera:MicroVideo"] || X["Camera:MotionPhoto"] || X["Camera:MicroVideo"] || ""));
      R.gainMap = !!X["hdrgm:Version"];
      findPersons(X, R.persons, false);
      ["xmp:CreatorTool", "tiff:Software", "xmp:Software"].forEach((k) => typeof X[k] === "string" && tool(`XMP ${k.replace(/^[^:]*:/, "")}`, X[k]));
      const xd = (id, k, label) => { const p = parseIso(typeof X[k] === "string" ? X[k] : ""); if (p) addDate(id, label, "XMP", X[k], p.wall, p.tz, { dateOnly: p.dateOnly }); };
      xd("xmp-create", "xmp:CreateDate", "الإنشاء"); xd("xmp-modify", "xmp:ModifyDate", "التعديل"); xd("xmp-metadata", "xmp:MetadataDate", "تعديل الميتاداتا"); xd("ps-created", "photoshop:DateCreated", "إنشاء المحتوى");
      if (!R.dates.some((x) => x.id === "original")) xd("xmp-original", "exif:DateTimeOriginal", "الالتقاط");
      if (!R.gps) {
        const lat = xmpCoord(X["exif:GPSLatitude"]), lon = xmpCoord(X["exif:GPSLongitude"]);
        if (lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
          let alt = null; const a = /^(-?\d+)(?:\/(\d+))?$/.exec(String(X["exif:GPSAltitude"] || "")); if (a) alt = +a[1] / (+a[2] || 1);
          R.gps = { lat, lon, alt, dir: null, acc: null, speed: null, src: "XMP", zero: Math.abs(lat) < 1e-6 && Math.abs(lon) < 1e-6 };
        }
      }
      for (const [k, v] of Object.entries(X)) {
        if (k === "xmpMM:History" || /^xmlns/.test(k)) continue;
        let sec = "xmp";
        if (/^exif:GPS/.test(k)) sec = "gps";
        else if (/^(xmp:(CreateDate|ModifyDate|MetadataDate)|photoshop:DateCreated)$/.test(k)) sec = "time";
        else if (/^(xmp:CreatorTool|xmpMM:|photoshop:DocumentAncestors|tiff:Software)/.test(k)) sec = "software";
        else if (/^(dc:|photoshop:(City|Country|State|Credit|Source|Headline|AuthorsPosition|CaptionWriter|Instructions|TransmissionReference|Category|Urgency)|Iptc4xmp|xmpRights:|plus:|cc:|mwg-rs:|MP:)/.test(k)) sec = "author";
        else if (/^(aux:|exifEX:(Lens|BodySerial|CameraOwner))/.test(k)) sec = "device";
        const txt = k === "photoshop:DocumentAncestors" ? `${cnt(R.ancestors, ["ملف واحد", "ملفان", "ملفات", "ملفاً"])}: ${xmpText(v)}` : xmpText(v);
        row(sec, "XMP", k, txt, v, SENS_X.test(k));
      }
    }

    /* ICC */
    if (F.icc) {
      try {
        const c = R.icc = parseICC(F.icc);
        if (c) {
          const add = (label, v) => { if (v) R.rows.push({ sec: "icc", src: "ICC", key: label, label, help: "", value: String(v), raw: v, sens: false }); };
          add("اسم ملف الألوان", c.desc || F.iccName || ""); add("حقوق ملف الألوان", c.copyright); add("فضاء الألوان", c.space); add("الفئة", { mntr: "شاشة", scnr: "جهاز إدخال (كاميرا/ماسح)", prtr: "طابعة", spac: "فضاء ألوان" }[c.cls] || c.cls);
          add("إصدار ICC", c.version); add("الجهة المصنّعة", { APPL: "Apple", MSFT: "Microsoft", ADBE: "Adobe", GOOG: "Google", SGI: "SGI", SUNW: "Sun", "HP": "HP" }[c.maker] || c.maker); add("منصّة الإنشاء", { APPL: "Apple", MSFT: "Microsoft", SGI: "SGI", SUNW: "Sun" }[c.platform] || c.platform);
          add("برنامج إنشاء الملف اللوني", c.creator || c.cmm); add("تاريخ إنشاء ملف الألوان", c.date ? fmtDate(c.date) : ""); add("حجم ملف الألوان", bytesLabel(c.size));
        }
      } catch { /* ICC تالف */ }
    }

    /* نصوص وتعليقات */
    R.texts = F.texts; R.comments = F.comments;
    for (const t of F.texts) {
      R.rows.push({ sec: "text", src: `PNG ${t.type}`, key: t.key, label: { parameters: "بارامترات التوليد", prompt: "مخطط ComfyUI (prompt)", workflow: "مخطط عمل ComfyUI", Software: "البرنامج", Comment: "تعليق", Description: "الوصف", Title: "العنوان", Author: "المؤلف", Copyright: "الحقوق", "Creation Time": "وقت الإنشاء", Source: "المصدر", Disclaimer: "إخلاء مسؤولية", Warning: "تحذير" }[t.key] || t.key, help: "", value: t.value, raw: t.value, sens: /^(Author|Comment|parameters|prompt|workflow|Description|Source)$/i.test(t.key) });
      if (/^(Software|software|generator|Generator)$/.test(t.key)) tool(`PNG ${t.key}`, t.value);
      if (/^(Creation Time|date:create|date:modify|create-date|modify-date)$/i.test(t.key)) { const p = parseIso(t.value) || (isFinite(Date.parse(t.value)) ? { wall: Date.parse(t.value), tz: 0 } : null); if (p) addDate(`png-${t.key}`, /modif/i.test(t.key) ? "التعديل (نص PNG)" : "الإنشاء (نص PNG)", "PNG", t.value, p.wall, p.tz); }
    }
    F.comments.forEach((c, i) => R.rows.push({ sec: "text", src: kind === "gif" ? "GIF" : "JPEG COM", key: `Comment${F.comments.length > 1 ? " " + (i + 1) : ""}`, label: "تعليق مضمّن", help: "نص حرّ يكتبه البرنامج الذي حفظ الملف.", value: c, raw: c, sens: true }));
    if (F.pngTime) addDate("png-time", "آخر تعديل (PNG tIME)", "PNG", isoWall(F.pngTime) + " UTC", F.pngTime, 0, { isUtc: true });

    /* فيديو */
    if (F.video) {
      const V = R.video = F.video, t = V.tags; const add = (label, v, sens, help) => { if (v != null && v !== "") R.rows.push({ sec: "doc", src: "QuickTime/MP4", key: label, label, help: help || "", value: String(v), raw: v, sens: !!sens }); };
      R.device = { make: t.Make || "", model: t.Model || "" };
      add("الشركة المصنّعة", t.Make, true); add("طراز الجهاز", t.Model, true); add("برنامج / إصدار النظام", t.Software, true); add("إصدار أندرويد", t.androidVersion, true); add("برنامج الترميز", t.encoder, false, "البرنامج الذي كتب الملف. اسم مثل Lavf أو HandBrake يعني أن الفيديو أُعيد ترميزه.");
      add("العنوان", t.title); add("الوصف", t.description); add("المؤلف", t.author, true); add("تعليق", t.comment, true); add("الحقوق", t.copyright);
      add("المدة", V.duration ? `${V.duration.toFixed(1)} ثانية` : ""); add("العلامات (brands)", V.brands);
      V.tracks.forEach((k, i) => add(`المسار ${i + 1}`, `${{ vide: "فيديو", soun: "صوت", meta: "ميتاداتا", text: "نص", sbtl: "ترجمة", tmcd: "ترميز زمني" }[k.handler] || k.handler || "؟"}${k.codec ? ` · ${k.codec}` : ""}${k.w ? ` · ${k.w}×${k.h}` : ""}${k.name ? ` · ${k.name}` : ""}`));
      if (V.vendorBoxes) add("صناديق خاصة بالمصنّع", V.vendorBoxes.join("، "), false, "صناديق تكتبها كاميرات بعينها (سامسونغ، GoPro…)، ووجودها يرجّح أن الملف خرج من الجهاز مباشرة.");
      if (t.contentId) add("معرّف Live Photo", t.contentId, true);
      tool("برنامج الترميز", t.encoder); tool("Software", t.Software);
      if (V.created) addDate("video-create", "إنشاء الفيديو (mvhd)", "MP4", isoWall(V.created) + " UTC", V.created, 0, { isUtc: true });
      if (V.modified && V.modified !== V.created) addDate("video-modify", "تعديل الفيديو (mvhd)", "MP4", isoWall(V.modified) + " UTC", V.modified, 0, { isUtc: true });
      if (t.qtCreationDate) { const p = parseIso(t.qtCreationDate); if (p) addDate("original", "الالتقاط (QuickTime)", "QuickTime", t.qtCreationDate, p.wall, p.tz); }
      if (t.day && !t.qtCreationDate) { const p = parseIso(t.day); if (p) addDate("video-day", "تاريخ المحتوى (©day)", "MP4", t.day, p.wall, p.tz, { dateOnly: p.dateOnly }); }
      const loc = iso6709(t.location);
      if (loc && Math.abs(loc.lat) <= 90 && Math.abs(loc.lon) <= 180) {
        R.gps = { lat: loc.lat, lon: loc.lon, alt: loc.alt, dir: null, acc: t.accuracy != null ? +t.accuracy : null, speed: null, src: "الفيديو", zero: Math.abs(loc.lat) < 1e-6 && Math.abs(loc.lon) < 1e-6 };
        R.rows.push({ sec: "gps", src: "QuickTime/MP4", key: "location", label: "موقع التصوير (ISO 6709)", help: "", value: t.location, raw: t.location, sens: true });
      }
    }
    /* PDF */
    if (F.pdf) {
      const P = R.pdf = F.pdf, I = P.info; const add = (label, v, sens, help) => { if (v != null && v !== "") R.rows.push({ sec: "doc", src: "PDF", key: label, label, help: help || "", value: String(v), raw: v, sens: !!sens }); };
      add("العنوان", I.Title); add("المؤلف", I.Author, true, "اسم حساب المستخدم على الحاسوب الذي أنشأ المستند غالباً."); add("الموضوع", I.Subject); add("الكلمات المفتاحية", I.Keywords); add("الشركة", I.Company, true);
      add("البرنامج المنشئ", I.Creator, true, "البرنامج الذي كُتب فيه المستند (Word مثلاً)."); add("مُنتِج الـ PDF", I.Producer, true, "المكتبة أو الطابعة الافتراضية التي حوّلته إلى PDF.");
      add("إصدار PDF", P.version); add("عدد الصفحات", P.pages || ""); add("مراحل الحفظ", P.revisions > 1 ? `${P.revisions} (حُفظ على مراحل بعد إنشائه)` : P.revisions ? "1" : "", false, "كل حفظ تزايدي يضيف طبقة إلى الملف. أكثر من مرحلة يعني أن المستند عُدّل بعد إنشائه.");
      add("مشفّر", P.encrypted ? "نعم (قد لا تُقرأ بعض الحقول)" : ""); add("يحتوي JavaScript", P.js ? "نعم" : "");
      tool("PDF Creator", I.Creator); tool("PDF Producer", I.Producer);
      const c = pdfDate(I.CreationDate), m = pdfDate(I.ModDate);
      if (c) addDate("pdf-create", "إنشاء المستند", "PDF", I.CreationDate, c.wall, c.tz); if (m) addDate("pdf-mod", "تعديل المستند", "PDF", I.ModDate, m.wall, m.tz);
      if (!Object.keys(I).length && P.objStm) F.notes.push("لم نجد قاموس المعلومات: هذا الـ PDF يخزّنه داخل كائنات مضغوطة لا نفكّها، فاعتمدنا على XMP إن وُجد.");
    }

    /* خصائص الصورة */
    const im = F.image; const irow = (label, v, help) => { if (v != null && v !== "" && v !== false) R.rows.push({ sec: "image", src: "الملف", key: label, label, help: help || "", value: String(v), raw: v, sens: false }); };
    if (kind !== "mp4" && kind !== "mov" && kind !== "pdf") {
      irow("الأبعاد الفعلية", im.w ? `${im.w} × ${im.h} بكسل` : ""); irow("طريقة الترميز", im.encoding); irow("عمق الألوان", im.bits ? `${im.bits} بت للقناة` : ""); irow("نظام الألوان", im.color);
      irow("تقليل عيّنات اللون", im.subsampling, "4:2:0 هو المعتاد في الهواتف ومنصات التواصل، و4:4:4 شائع في برامج التحرير عند الجودة العالية.");
      irow("جودة ضغط JPEG التقديرية", im.quality ? `≈ ${im.quality}%` : "", "محسوبة من جدول التكميم. المنصات تعيد الضغط عادة بين 70% و85%، والكاميرات بين 90% و98%. تقديرية وليست قاطعة.");
      irow("التشابك", im.interlace); irow("الدقة", im.dpi ? `${im.dpi} نقطة/بوصة` : ""); irow("غاما", im.gamma); irow("عدد الإطارات", im.frames > 1 ? im.frames : ""); irow("شفافية", im.alpha ? "نعم" : "");
      irow("تدوير (HEIF)", im.rotation ? `${im.rotation}°` : ""); irow("علامة الملف", im.brand);
      if (F.jfif) irow("JFIF", `إصدار ${F.jfif.version}، ${F.jfif.x}×${F.jfif.y} ${["نسبة أبعاد", "نقطة/بوصة", "نقطة/سم"][F.jfif.units] || ""}`);
      if (F.aux.length) irow("صور مساعدة مضمّنة", F.aux.join("، "), "خرائط عمق أو أقنعة تحفظها الهواتف مع صور البورتريه وHDR.");
    }
    if (F.irb.length) R.rows.push({ sec: "software", src: "Photoshop", key: "Photoshop IRB", label: "موارد فوتوشوب", help: "مقطع تكتبه برامج Adobe (وبعض البرامج الأخرى) عند الحفظ.", value: F.irb.map((x) => x.name).join("، "), raw: F.irb.map((x) => ({ id: x.id, size: x.size })), sens: false });
    if (F.ducky != null) R.rows.push({ sec: "software", src: "Ducky", key: "Ducky", label: "حفظ للويب (فوتوشوب)", help: "مقطع يكتبه أمر «Save for Web» في فوتوشوب.", value: F.ducky >= 0 ? `جودة ${F.ducky}%` : "موجود", raw: F.ducky, sens: false });

    R.thumbs = F.thumbs; R.trailing = F.trailing; R.truncated = F.truncated; R.irb = F.irb; R.ducky = F.ducky; R.mpf = F.mpf; R.jfif = F.jfif; R.exifBlocks = F.exifBlocks; R.c2paSize = F.c2paSize;
    R.has = {
      exif: !!T && (Object.keys(T.ifd0).length + Object.keys(T.exif).length) > 0, gps: !!R.gps || (!!T && Object.keys(T.gps).length > 0), xmp: Object.keys(X).length > 0, iptc: Object.keys(R.iptc).length > 0, icc: !!F.icc,
      makernote: !!R.makerNote, c2pa: F.c2paSize > 0, comments: F.comments.length > 0, text: F.texts.length > 0, thumbnail: F.thumbs.length > 0, photoshop: F.irb.length > 0, trailing: !!F.trailing, jfif: !!F.jfif
    };
    // هل EXIF المتبقي مجرد اتجاه الصورة؟ (يُعدّ نظيفاً)
    R.exifOnlyOrientation = !!T && Object.keys(T.exif).length === 0 && Object.keys(T.gps).length === 0 && Object.keys(T.ifd0).every((k) => k === "Orientation");
    R.dates.sort((a, b) => a.wall - b.wall);
    return R;
  }

  /* ==========================================================
     التحليل: ماذا تعني هذه البيانات للمتحقق، وماذا تكشف عن صاحبها؟
     ctx = { name, lastModified, dims:{w,h}, prov (من Provenance), thumbCmp }
     ========================================================== */
  const EDITORS = [["Adobe Photoshop", /photoshop/i], ["Adobe Lightroom", /lightroom/i], ["Adobe Camera Raw", /camera raw/i], ["GIMP", /\bgimp\b/i], ["Canva", /canva/i], ["Snapseed", /snapseed/i], ["PicsArt", /picsart/i], ["Pixelmator", /pixelmator/i], ["Affinity Photo", /affinity/i], ["Capture One", /capture one/i], ["Paint.NET", /paint\.net/i], ["Meitu", /meitu/i], ["VSCO", /vsco/i], ["darktable", /darktable/i], ["Luminar", /luminar/i], ["PhotoScape", /photoscape/i], ["Krita", /krita/i], ["Adobe Illustrator", /illustrator/i], ["Adobe Express", /adobe express/i], ["InShot", /inshot/i], ["CapCut", /capcut/i], ["Microsoft Paint", /^paint$|microsoft paint|ms paint/i], ["Windows Photos", /windows photo|microsoft\.windows\.photos/i], ["ImageMagick", /imagemagick/i], ["Adobe Premiere", /premiere/i], ["PhotoDirector", /photodirector/i], ["Polarr", /polarr/i], ["Photopea", /photopea/i], ["Pixlr", /pixlr/i], ["ACDSee", /acdsee/i], ["IrfanView", /irfanview/i], ["XnView", /xnview/i]];
  const fileNameDate = (n) => {
    let m = /(?:^|[^\d])(20\d\d|19\d\d)[-_.]?(0[1-9]|1[0-2])[-_.]?([0-2]\d|3[01])[-_ T.]?([01]\d|2[0-3])[-_.]?([0-5]\d)[-_.]?([0-5]\d)(?!\d)/.exec(n || "");
    if (m) return { wall: Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]), dateOnly: false };
    m = /(?:^|[^\d])(20\d\d|19\d\d)[-_.]?(0[1-9]|1[0-2])[-_.]?([0-2]\d|3[01])(?!\d)/.exec(n || "");
    return m ? { wall: Date.UTC(+m[1], +m[2] - 1, +m[3]), dateOnly: true } : null;
  };
  /* العدد مع تمييزه بالعربية: واحد، مثنّى، جمع (3-10)، مفرد منصوب (11+) */
  const cnt = (n, f) => n === 1 ? f[0] : n === 2 ? f[1] : n % 100 >= 3 && n % 100 <= 10 ? `${n} ${f[2]}` : `${n} ${f[3]}`;
  const span = (ms) => {
    const a = Math.abs(ms), d = a / 86400000;
    if (d >= 700) return cnt(Math.round(d / 365), ["سنة واحدة", "سنتين", "سنوات", "سنة"]);
    if (d >= 59) return cnt(Math.round(d / 30), ["شهر واحد", "شهرين", "أشهر", "شهراً"]);
    if (d >= 2) return cnt(Math.round(d), ["يوم واحد", "يومين", "أيام", "يوماً"]);
    const h = a / 3600000; if (h >= 2) return cnt(Math.round(h), ["ساعة واحدة", "ساعتين", "ساعات", "ساعة"]);
    const mi = a / 60000; if (mi >= 2) return cnt(Math.round(mi), ["دقيقة واحدة", "دقيقتين", "دقائق", "دقيقة"]);
    return cnt(Math.round(a / 1000), ["ثانية واحدة", "ثانيتين", "ثوانٍ", "ثانية"]);
  };

  function analyze(R, ctx = {}) {
    const pv = ctx.prov || null, verify = [], privacy = [], now = Date.now();
    const V = (level, icon, title, text) => verify.push({ level, icon, title, text });
    const P = (level, icon, text, score) => { privacy.push({ level, icon, text }); pscore += score; };
    let pscore = 0, reenc = false;
    const D = (id) => R.dates.find((x) => x.id === id);
    const media = R.kind === "pdf" ? "المستند" : R.kind === "mp4" || R.kind === "mov" ? "الفيديو" : "الصورة";
    const isImg = !R.pdf && !R.video;

    /* --- الذكاء الاصطناعي وبيانات المنشأ (من وحدة Provenance المشتركة) --- */
    let ai = false;
    if (pv) {
      const names = pv.generators.map((g) => g.name);
      if (pv.sourceType === "ai" || pv.sourceType === "composite-ai" || names.length) {
        ai = true;
        V("danger", "bot", "الملف نفسه يصرّح بأنه من إنتاج الذكاء الاصطناعي",
          [names.length ? `المولّد المذكور: <strong>${names.join("، ")}</strong> (في ${pv.generators.map((g) => g.where).join("، ")}).` : "", pv.sourceType ? `وسم «نوع المصدر الرقمي» يقول: ${pv.sourceType === "ai" ? "مولَّدة بنموذج ذكاء اصطناعي" : "مركّبة تتضمن عناصر مولَّدة"} (من ${pv.sourceTypeFrom}).` : "", "هذا تصريح مكتوب داخل الملف، وهو أقوى من أي تخمين بصري، لكن حذفه سهل، فغيابه لا يثبت العكس."].filter(Boolean).join(" "));
      }
      if (pv.c2pa) {
        const c = pv.c2pa;
        V("info", "badge-check", "تحمل «بيانات اعتماد المحتوى» (C2PA)",
          [c.generator ? `أنشأها: <strong>${c.generator}</strong>.` : "", c.signers.length ? `الجهة الموقِّعة: ${c.signers.join("، ")}.` : "", c.actions.length ? `العمليات المسجّلة: ${c.actions.map((a) => (window.Provenance && window.Provenance.C2PA_ACTIONS[a]) || a).join("، ")}.` : "", "نقرأ محتوى السجل فقط ولا نتحقق من صحة التوقيع الرقمي. للتحقق من التوقيع استخدم الموقع الرسمي contentcredentials.org/verify."].filter(Boolean).join(" "));
      } else if (R.has.c2pa) V("info", "badge-check", "تحتوي حاوية JUMBF", "قد تكون بيانات اعتماد محتوى (C2PA) لم نتمكن من قراءتها.");
      if (pv.aiEditors.length) V("warn", "sparkles", "عولجت بتطبيق تحسين بالذكاء الاصطناعي", `${pv.aiEditors.map((e) => e.name).join("، ")}. الصورة قد تكون حقيقية الأصل لكن تفاصيلها (الوجوه خصوصاً) أعاد النموذج رسمها.`);
    }

    /* --- برامج التعديل --- */
    const editors = [];
    for (const t of R.tools) for (const [name, re] of EDITORS) if (re.test(t.value) && !editors.some((e) => e.name === name)) editors.push({ name, where: t.where, value: t.value });
    const saves = R.history.filter((h) => h.action === "saved").length;
    if (editors.length) {
      V("warn", "pencil-ruler", `مرّت على برنامج تعديل: ${editors.map((e) => e.name).join("، ")}`,
        `${editors.map((e) => `«${e.value}» في ${e.where}`).slice(0, 3).join("، ")}. ${R.history.length ? `سجل التحرير يضم ${cnt(R.history.length, ["حدثاً واحداً", "حدثين", "أحداث", "حدثاً"])}${saves ? `، منها ${cnt(saves, ["عملية حفظ واحدة", "عمليتا حفظ", "عمليات حفظ", "عملية حفظ"])}` : ""}. ` : ""}الحفظ ببرنامج تعديل لا يعني تلاعباً بالمضمون (قد يكون قصّاً أو تصحيح ألوان)، لكنه يعني أن هذا الملف ليس ما خرج من الكاميرا مباشرة.`);
    } else if (R.history.length) V("info", "history", "تحمل سجل تحرير في XMP", `${cnt(R.history.length, ["حدث واحد مسجّل", "حدثان مسجّلان", "أحداث مسجّلة", "حدثاً مسجّلاً"])}. راجع قسم «البرامج وآثار التعديل».`);
    if (R.ancestors) V("warn", "layers", "فيها آثار تركيب من ملفات أخرى", `حقل DocumentAncestors في فوتوشوب يذكر ${cnt(R.ancestors, ["ملفاً واحداً", "ملفين", "ملفات", "ملفاً"])} لُصقت منها عناصر في هذه الصورة. قرينة قوية على أنها مركّبة أو مرّت بمشروع متعدد الطبقات.`);
    if (R.crs > 3 && !editors.some((e) => /Lightroom|Camera Raw/.test(e.name))) V("info", "sliders-horizontal", "تحمل إعدادات تحرير Camera Raw / Lightroom", `${R.crs} إعداداً (تعريض، ألوان، قصّ…).`);
    if (R.ducky != null && !editors.length) V("info", "pencil-ruler", "حُفظت بأمر «حفظ للويب» في فوتوشوب", "وُجد مقطع Ducky الذي يكتبه فوتوشوب، مع أن اسم البرنامج محذوف من بقية الحقول.");
    else if (R.has.photoshop && !editors.length && !R.has.iptc) V("info", "pencil-ruler", "تحتوي مقطع موارد فوتوشوب", "يكتبه فوتوشوب وبعض البرامج والمنصات عند الحفظ.");
    if (R.windowsEdit) V("info", "app-window", "عُدّلت خصائصها من ويندوز", "وُجدت حقول XP أو حشو ويندوز، أي أن أحداً حرّر العنوان أو الكلمات المفتاحية أو التقييم من مستكشف الملفات.");

    /* --- الصورة المصغّرة --- */
    const tc = ctx.thumbCmp;
    if (tc && tc.ok) {
      if (tc.differs) V("warn", "images", "الصورة المصغّرة المضمّنة لا تطابق الصورة", `${tc.aspect ? "نسبة أبعادها مختلفة (قُصّت الصورة بعد التقاطها). " : ""}${tc.diff != null ? `نسبة الاختلاف في المحتوى ${Math.round(tc.diff * 100)}%. ` : ""}المصغّرة تُحفظ لحظة الالتقاط، وبعض برامج التعديل لا تحدّثها، فتبقى شاهدة على شكل الصورة قبل التعديل. قارن بينهما في بطاقة «الصورة المصغّرة».`);
      else V("success", "images", "الصورة المصغّرة المضمّنة تطابق الصورة", "لا فرق ظاهر بين المصغّرة المحفوظة داخل الملف والصورة نفسها.");
    }

    /* --- التواريخ --- */
    const o = D("original"), mo = D("modified"), g = D("gps"), dg = D("digitized");
    const cap = o || dg;
    if (o && mo) {
      const diff = mo.wall - o.wall;
      if (diff < -90000) V("warn", "calendar-x", "تاريخ الحفظ يسبق تاريخ الالتقاط", `آخر حفظ قبل الالتقاط بمدة ${span(diff)}. هذا غير منطقي، ويدل على ساعة كاميرا خاطئة أو على كتابة التواريخ يدوياً.`);
      else if (diff > 90000) V("info", "calendar-clock", `أُعيد حفظها بعد الالتقاط بمدة ${span(diff)}`, "تاريخ آخر حفظ يختلف عن تاريخ الالتقاط، فالملف عُدّل أو أُعيد تصديره بعد التصوير.");
    }
    if (cap && g) {
      if (cap.utc != null) { const diff = cap.utc - g.utc; if (Math.abs(diff) > 3600000) V("warn", "satellite", "وقت GPS لا يطابق وقت الكاميرا", `الفرق ${span(diff)} بعد احتساب فرق التوقيت المسجّل. وقت الأقمار الصناعية أوثق من ساعة الكاميرا، فإما أن الساعة مضبوطة خطأ أو أن أحد الحقلين عُدّل.`); else V("success", "satellite", "وقت الكاميرا يطابق وقت الأقمار الصناعية", `الفرق ${span(diff)} فقط، وهذا اتساق جيد يصعب أن يحدث صدفة في بيانات مزوّرة بإهمال.`); }
      else {
        const off = (cap.wall - g.wall) / 3600000;
        if (Math.abs(off) > 14.5) V("warn", "satellite", "تاريخ GPS لا يطابق تاريخ الكاميرا", `الفرق ${span(cap.wall - g.wall)}، وهو أكبر من أي فرق توقيت ممكن على الأرض. ساعة الكاميرا خاطئة أو أحد التاريخين عُدّل.`);
        else {
          const tz = Math.round(off * 4) / 4; let extra = "";
          if (R.gps && !R.gps.zero) { const exp = R.gps.lon / 15; if (Math.abs(tz - exp) > 3) extra = ` لكن خط الطول ${R.gps.lon.toFixed(1)}° يوحي بتوقيت قريب من UTC${exp >= 0 ? "+" : ""}${Math.round(exp)}، فالساعة ربما لم تُضبط على توقيت مكان التصوير.`; }
          V(extra ? "info" : "success", "satellite", `وقت الكاميرا متّسق مع GPS (توقيت UTC${tz >= 0 ? "+" : ""}${tz})`, `الفرق بين ساعة الكاميرا والوقت العالمي يساوي فرق توقيت معقولاً.${extra}`);
        }
      }
    }
    for (const d of R.dates) {
      if (d.wall > now + 2 * 86400000) { V("warn", "calendar-x", "تاريخ في المستقبل", `حقل «${d.label}» (${d.src}) يحمل تاريخاً لم يأتِ بعد: ${isoWall(d.wall, d.dateOnly)}. ساعة الجهاز خاطئة أو التاريخ مكتوب يدوياً.`); break; }
    }
    if (cap && cap.wall < Date.UTC(1995, 0, 1)) V("warn", "calendar-x", "تاريخ الالتقاط قديم بشكل غير معقول", `${isoWall(cap.wall)}: يدل غالباً على ساعة كاميرا غير مضبوطة (تاريخ المصنع).`);
    if (R.badDates) V("info", "calendar-x", "حقول تاريخ فارغة أو غير صالحة", R.badDates.join("، "));
    const xc = D("xmp-create") || D("ps-created") || D("iptc-created");
    if (cap && xc && Math.abs(cap.wall - xc.wall) > 36 * 3600000) V("warn", "calendar-x", "تاريخ EXIF يخالف تاريخ XMP / IPTC", `الالتقاط في EXIF: ${isoWall(cap.wall)}، وفي ${xc.src}: ${isoWall(xc.wall, xc.dateOnly)}. أحدهما عُدّل دون الآخر.`);
    const fd = fileNameDate(ctx.name);
    if (fd && cap && Math.abs(fd.wall - cap.wall) > 36 * 3600000) V("info", "file-question", "التاريخ في اسم الملف يخالف تاريخ الالتقاط", `اسم الملف يوحي بـ ${isoWall(fd.wall, fd.dateOnly)}، وتاريخ الالتقاط ${isoWall(cap.wall)}.`);
    const vc = D("video-create");
    if (vc && vc.wall < Date.UTC(1990, 0, 1)) V("info", "calendar-x", "تاريخ إنشاء الفيديو غير مضبوط", "القيمة صفرية أو قديمة جداً، وهذا شائع في الفيديوهات المعاد ترميزها.");

    /* --- اتساق بيانات الكاميرا --- */
    const dv = R.device || {}; const hasCam = !!(dv.make || dv.model);
    const dims = ctx.dims && ctx.dims.w ? ctx.dims : R.image.w ? R.image : null;
    if (R.exifDims && dims && R.exifDims.w && R.exifDims.h) {
      const a = [R.exifDims.w, R.exifDims.h].sort((x, y) => x - y), b = [dims.w, dims.h].sort((x, y) => x - y);
      if (Math.abs(a[0] - b[0]) > 2 || Math.abs(a[1] - b[1]) > 2) V("warn", "crop", "أبعاد الصورة تغيّرت بعد الالتقاط", `EXIF يسجّل ${R.exifDims.w}×${R.exifDims.h}، والصورة الفعلية ${dims.w}×${dims.h}. الصورة قُصّت أو صُغّرت بعد التقاطها، فهي ليست الملف الأصلي.`);
    }
    if (R.exifBlocks > 1 && isImg) V("info", "copy", "أكثر من مقطع EXIF", `عدد مقاطع EXIF في الملف: ${R.exifBlocks}. غير معتاد، ويدل أحياناً على دمج ميتاداتا من ملف آخر.`);
    if (R.gps && R.gps.zero) V("warn", "map-pin-off", "إحداثيات GPS صفرية (0، 0)", "الموقع يشير إلى خليج غينيا، وهي قيمة فارغة لا مكان حقيقي.");
    else if (R.gps) V("info", "map-pin", "تحمل إحداثيات مكان التصوير", `مصدرها ${R.gps.src}. قارن المكان بما يُدَّعى عن ${media}، وطابق معالمه مع صور الأقمار الصناعية. الإحداثيات يمكن تعديلها، فلا تكتفِ بها.`);

    /* --- بنية الملف --- */
    if (R.extMismatch) V("warn", "file-warning", "امتداد الملف لا يطابق صيغته الحقيقية", `الاسم ينتهي بـ .${R.ext} لكن المحتوى ${R.kindLabel}. يحدث عند إعادة التسمية يدوياً أو عند تنزيل الملف من بعض المواقع.`);
    if (R.truncated) V("warn", "file-warning", "الملف مبتور أو تالف", "لم تكتمل بنيته حتى علامة النهاية. قد يكون التنزيل ناقصاً.");
    if (R.trailing) V(R.trailing.video || /صور إضافية|سامسونغ/.test(R.trailing.what) ? "info" : "warn", "paperclip", "بيانات ملحقة بعد نهاية الصورة", `${bytesLabel(R.trailing.size)}: ${R.trailing.what}. ${R.trailing.video ? "الفيديو المضمّن قد يحمل ميتاداتا خاصة به (وصوتاً)، ويبقى في الملف حتى لو نُظّفت الصورة بأدوات لا تنتبه له." : /مجهولة|أرشيف/.test(R.trailing.what) ? "بيانات غير معتادة قد تكون ملفاً مخفياً داخل الصورة." : ""}`);
    if (R.motion && !R.trailing) V("info", "film", "موسومة كصورة متحركة", "XMP يقول إنها Motion Photo لكن الفيديو المضمّن غير موجود، أي أن الملف أُعيد حفظه.");
    if (R.pdf) {
      if (R.pdf.revisions > 1) V("info", "history", `المستند حُفظ على مراحل (${R.pdf.revisions})`, "أُضيفت إليه تعديلات بعد إنشائه (توقيع، تعليقات، تعبئة نموذج أو تحرير). النسخ السابقة قد تبقى قابلة للاستخراج من الملف.");
      const c = D("pdf-create"), m = D("pdf-mod"); if (c && m && m.wall - c.wall > 90000) V("info", "calendar-clock", `عُدّل بعد إنشائه بمدة ${span(m.wall - c.wall)}`, "تاريخ التعديل يختلف عن تاريخ الإنشاء.");
      if (R.pdf.encrypted) V("info", "lock", "المستند مشفّر", "بعض الحقول قد تظهر مشوّهة أو لا تُقرأ.");
    }
    if (R.video) {
      const enc = R.video.tags.encoder || "";
      if (/^Lavf|ffmpeg|HandBrake/i.test(enc)) reenc = true;
      if (reenc) V("warn", "pencil-ruler", "الفيديو أُعيد ترميزه", `برنامج الترميز «${enc}» لا تكتبه الكاميرات، بل أدوات التحويل والمنصات. هذا ليس الملف الأصلي من الجهاز.`);
    }

    /* --- خلاصة الحالة --- */
    if (reenc) editors.push({ name: "أداة إعادة ترميز", where: "encoder", value: R.video.tags.encoder });
    const identifying = R.has.exif && !R.exifOnlyOrientation || R.has.xmp || R.has.iptc || R.has.text || R.has.comments || R.has.c2pa || !!R.video && Object.keys(R.video.tags).length > 0 || !!R.pdf && Object.keys(R.pdf.info).length > 0;
    let state, headline, sub;
    if (ai) { state = "ai"; headline = "الملف يصرّح بأنه مولَّد بالذكاء الاصطناعي"; sub = "وجدنا داخل الملف بيانات منشأ تذكر مولّداً أو وسماً معيارياً للمحتوى المولَّد."; }
    else if (!identifying) {
      state = "stripped"; headline = `${media === "الصورة" ? "صورة" : media === "الفيديو" ? "فيديو" : "مستند"} بلا ميتاداتا تعريفية`;
      sub = pv && pv.platform ? `يبدو أنها مرّت عبر ${pv.platform.name} (${pv.platform.why})، والمنصات تحذف الميتاداتا وتعيد الضغط.` : "لا كاميرا ولا تاريخ ولا موقع. هذا هو المعتاد في الصور المنقولة عبر مواقع التواصل وتطبيقات المراسلة ولقطات الشاشة.";
      V("info", "eraser", "لا توجد ميتاداتا تعريفية", `${sub} غيابها لا يدل على التزييف ولا على الأصالة. اعتمد على البحث العكسي وتحليل المحتوى.`);
    }
    else if (editors.length || R.ancestors || (tc && tc.ok && tc.differs)) { state = "edited"; headline = reenc ? "فيديو أُعيد ترميزه" : hasCam ? "بيانات كاميرا مع آثار برنامج تعديل" : "ملف خرج من برنامج تعديل"; sub = "الملف أُعيد حفظه ببرنامج، فهو ليس النسخة الخارجة من الكاميرا مباشرة."; }
    else if (isImg && hasCam && cap && (R.exifComplete >= 3 || R.makerNote)) {
      const conflicts = verify.filter((v) => v.level === "warn" && /calendar-x|satellite|crop|file-warning/.test(v.icon)).length;
      const cam = `${[dv.make, dv.model].filter(Boolean).join(" ")}${R.makerNote ? "، مع ملاحظات المصنّع" : ""}${R.has.thumbnail ? " وصورة مصغّرة" : ""}.`;
      if (conflicts) {
        state = "conflict"; headline = "بيانات كاميرا فيها تعارضات"; sub = `${cam} لكن بعض الحقول لا يتّسق مع بعض (${cnt(conflicts, ["تنبيه واحد", "تنبيهان", "تنبيهات", "تنبيهاً"])})، فراجعها قبل الاعتماد على التاريخ أو المكان.`;
        V("info", "camera", "بيانات كاميرا كاملة", `${cam} وجودها لا يلغي التعارضات المذكورة أعلاه.`);
      } else {
        state = "camera"; headline = "بيانات كاميرا كاملة ومتّسقة"; sub = `${cam} يُرجَّح أنه ملف أصلي أو قريب من الأصل.`;
        V("success", "camera", "بيانات كاميرا كاملة", `${sub} تذكّر أن كل هذه الحقول يمكن نسخها من صورة أخرى بأدوات مجانية، فهي قرينة لا دليل قاطع.`);
      }
    }
    else if (R.video) { state = hasCam ? "camera" : "partial"; headline = hasCam ? "فيديو يحمل بيانات جهاز التصوير" : "فيديو بميتاداتا جزئية"; sub = hasCam ? `${[dv.make, dv.model].filter(Boolean).join(" ")}.` : "وُجدت تواريخ أو برنامج ترميز بلا بيانات جهاز."; }
    else if (R.pdf) { state = "partial"; headline = "مستند يحمل بيانات عن منشئه"; sub = [R.pdf.info.Author ? `المؤلف: ${R.pdf.info.Author}` : "", R.pdf.info.Creator ? `البرنامج: ${R.pdf.info.Creator}` : ""].filter(Boolean).join("، ") || "راجع الحقول أدناه."; }
    else { state = "partial"; headline = "ميتاداتا جزئية"; sub = "توجد بعض الحقول لكنها لا تكفي لمعرفة الجهاز أو لحظة الالتقاط."; }
    if (pv && pv.platform && state !== "stripped") V("info", "share-2", `يبدو أنها مرّت عبر ${pv.platform.name}`, `الدليل: ${pv.platform.why}.`);
    if (R.notes.length) R.notes.forEach((n) => V("info", "info", "ملاحظة عن القراءة", n));

    /* --- الخصوصية --- */
    if (R.gps && !R.gps.zero) P("danger", "map-pin", "إحداثيات GPS تكشف مكان التصوير بدقة أمتار (قد يكون بيتك).", 55);
    if (dv.serial || dv.lensSerial || dv.owner || R.rows.some((r) => /SerialNumber|OwnerName/.test(r.key) && r.src === "XMP")) P("danger", "fingerprint", "رقم تسلسلي أو اسم مالك يربط كل صورك بالجهاز نفسه.", 15);
    if (hasCam) P("warn", "smartphone", `نوع جهازك: ${[dv.make, dv.model].filter(Boolean).join(" ")}.`, 10);
    if (cap || D("video-create") || D("pdf-create")) P("warn", "calendar-clock", `تاريخ ${R.pdf ? "إنشاء المستند" : "التصوير"} ووقته بالثانية.`, 10);
    if (dv.artist || dv.copyright || R.iptc.Byline || R.xmp["dc:creator"] || (R.pdf && R.pdf.info.Author) || (R.video && R.video.tags.author)) P("warn", "user-round", "اسم المؤلف أو صاحب الحقوق.", 10);
    if (R.persons.length) P("danger", "scan-face", `أسماء أشخاص موسومين في الصورة: ${R.persons.slice(0, 5).join("، ")}.`, 15);
    if (R.has.thumbnail) P("warn", "images", "صورة مصغّرة مضمّنة قد تُظهر الصورة قبل قصّها أو تعديلها.", 5);
    if (R.trailing && R.trailing.video) P("warn", "film", "فيديو قصير مضمّن (مع الصوت) ملحق بالصورة.", 10);
    else if (R.trailing) P("info", "paperclip", "بيانات ملحقة بعد نهاية الصورة.", 5);
    if (R.xmp["xmpMM:DocumentID"] || R.xmp["xmpMM:OriginalDocumentID"] || dv.uniqueId) P("info", "hash", "معرّفات فريدة تربط نسخ الملف ببعضها.", 5);
    if (R.tools.length) P("info", "app-window", "البرامج أو إصدار النظام الذي عالج الملف.", 5);
    if (R.has.text || R.has.comments) P("info", "message-square-text", "نصوص وتعليقات مضمّنة (قد تتضمن أمر التوليد أو ملاحظات).", 5);
    pscore = Math.min(100, pscore);
    const plevel = pscore === 0 ? "clean" : pscore < 25 ? "low" : pscore < 55 ? "medium" : "high";

    const order = { danger: 0, warn: 1, success: 2, info: 3 };
    verify.sort((a, b) => order[a.level] - order[b.level]);
    return { state, headline, sub, verify, privacy, score: pscore, level: plevel, editors, ai, fileNameDate: fd };
  }

  window.MetaScan = { scan, analyze, cnt, span, fmtDate, isoWall, tzText, bytesLabel, sniff, SECTIONS, KINDS, HIST_ACT, compass };
})();
