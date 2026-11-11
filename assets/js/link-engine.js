/* ==========================================================
   محرّك فاحص الروابط (window.LinkEngine)
   تحليل بنيوي كامل داخل المتصفح: لا يفتح الرابط ولا يرسل شيئاً إلى أي خادم.
   الفحوص الحيّة (قوائم الحجب، DNS، عمر النطاق…) في assets/js/pages/tool-link.js
   ========================================================== */
(function (root) {
  "use strict";
  const S = (s) => new Set(s.trim().split(/\s+/));

  /* ---------- القوائم ---------- */
  const SHORTENERS = S(`bit.ly bitly.com j.mp tinyurl.com goo.gl ow.ly is.gd v.gd buff.ly cutt.ly cutt.us rb.gy shorturl.at shorturl.asia shorturl.com tiny.cc tiny.one s.id t.ly rebrand.ly bl.ink
    shorte.st adf.ly qrco.de short.gy short.io urlz.fr surl.li tny.im x.co soo.gd clck.ru vk.cc u.to dub.sh dub.co kutt.it lnk.to smarturl.it trib.al dlvr.it ift.tt cli.re shrtco.de 1url.com t2m.io
    hyperurl.co zpr.io ouo.io ouo.press bc.vc linkvertise.com exe.io cur.lv tr.im po.st mcaf.ee db.tt qr.ae snip.ly snipurl.com chilp.it lc.cx rotf.lol n9.cl acesse.one bom.so shrinkme.io gg.gg goo.su
    2u.pw kisa.link tinu.be shorter.me me-qr.com qr.io l.ead.me app.link onelink.me page.link bit.do lnkiy.com shorturl.gg t.cn url.cn dwz.cn suo.im 3.ly u.nu utka.su tinyurl.cc shrtm.nu rebrandly.com
    linkr.it lnk.bio.link s.click.aliexpress.com b23.tv reurl.cc pse.is lihi.cc ppt.cc lurl.cc risu.io urlshort.dev sh.st festyy.com ceesty.com zzb.bz ity.im q.gs u.bb cutt.ee s.yam.com t.co lnkd.in amzn.to db.tt aka.ms a.co g.co fb.me we.tl spotify.link`);
  const IP_LOGGERS = S(`grabify.link grabify.org iplogger.org iplogger.com iplogger.ru iplogger.co iplogger.info 2no.co yip.su iplis.ru 02ip.ru ezstat.ru blasze.com blasze.tk ipgrabber.ru ipgraber.ru
    ps3cfw.com bmwforum.co leancoding.co spottyfly.com stopify.co xda.ac curiouscat.club catsnthings.fun catsnthing.com crabrave.pw joinmy.site lovebird.guru screenshare.host gyazo.in partpicker.shop
    sportshub.bar locations.quest datasig.io datauth.io headshot.monster gaming-at-my.best progaming.monster yourmy.monster imageshare.best screenshot.best gamingfun.me fortnitechat.site fortnight.space
    freegiftcards.co shrekis.life wearesocial.io whatstheirip.com iplo.ru canarytokens.com canarytokens.org ipgrab.org iplogger.cn myprivate.pics photovault.pics`);
  const TLD_HIGH = S(`zip mov tk ml ga cf gq top xyz click icu cfd sbs cyou rest buzz monster quest bond lol loan win men date racing review stream download gdn work support country kim cam
    skin hair beauty boats autos mom pics lat bar surf uno ink wiki best fit cricket science party faith accountant webcam bid trade locker`);
  const TLD_MED = S(`live online site website space fun shop store club vip info cc pw ws link help today world life ru su cn press host tech pro app dev page digital cloud email center network one`);
  const SLD2 = S(`com net org gov edu co ac mil or ne go gob nom info biz web ltd plc me sch id in int k12 res firm gen ind art tv name pro law med nic govt`);

  /* منصّات ينشر عليها أي شخص: الاسم الموثوق للمنصّة لا يعني أن الصفحة موثوقة */
  const P = (kind, list) => list.trim().split(/\s+/).map((s) => ({ kind, s }));
  const PLATFORMS = [
    ...P("site", `pages.dev workers.dev web.app firebaseapp.com vercel.app netlify.app github.io gitlab.io glitch.me repl.co replit.app replit.dev herokuapp.com onrender.com railway.app fly.dev deno.dev surge.sh
      weebly.com wixsite.com wixstudio.io wordpress.com 000webhostapp.com webflow.io framer.app framer.website godaddysites.com square.site canva.site my.canva.site appspot.com azurewebsites.net
      azureedge.net cloudfront.net notion.site carrd.co mystrikingly.com strikingly.com jimdosite.com yolasite.com ucoz.net tilda.ws plesk.page cprapid.com
      codepen.io codesandbox.io stackblitz.io jsfiddle.net myshopify.com webnode.page site123.me mozello.com bubbleapps.io softr.app hostingersite.com lovable.app
      amplifyapp.com netlify.com sites.google.com telegra.ph translate.goog`),
    ...P("bucket", `storage.googleapis.com firebasestorage.googleapis.com r2.dev blob.core.windows.net web.core.windows.net backblazeb2.com digitaloceanspaces.com s3.amazonaws.com amazonaws.com`),
    ...P("tunnel", `ngrok.io ngrok-free.app ngrok-free.dev ngrok.app trycloudflare.com loca.lt serveo.net localhost.run lhr.life tunnelmole.net pinggy.link pinggy.io devtunnels.ms`),
    ...P("ddns", `duckdns.org ddns.net hopto.org zapto.org sytes.net no-ip.org no-ip.biz dynu.net dyndns.org freeddns.org myftp.org serveftp.com servehttp.com 3utilities.com bounceme.net gotdns.ch`),
    ...P("ipfs", `ipfs.io dweb.link cf-ipfs.com pinata.cloud mypinata.cloud nftstorage.link w3s.link ipfs.dweb.link 4everland.io fleek.co`),
    ...P("file", `cdn.discordapp.com media.discordapp.net dropbox.com dropboxusercontent.com onedrive.live.com 1drv.ms sharepoint.com mediafire.com mega.nz wetransfer.com we.tl transfer.sh gofile.io pixeldrain.com
      catbox.moe raw.githubusercontent.com gist.githubusercontent.com drive.google.com drive.usercontent.google.com anonfiles.com file.io uploadhaven.com 4shared.com zippyshare.com sendspace.com terabox.com`),
    ...P("form", `forms.gle docs.google.com script.google.com typeform.com jotform.com tally.so forms.office.com formstack.com wufoo.com 123formbuilder.com cognitoforms.com paperform.co`),
    ...P("bio", `linktr.ee bio.link beacons.ai lnk.bio taplink.cc start.page allmylinks.com solo.to campsite.bio`),
    ...P("paste", `pastebin.com rentry.co rentry.org hackmd.io gist.github.com paste.ee ghostbin.com justpaste.it`)
  ].sort((a, b) => b.s.length - a.s.length);
  const PLATFORM_AR = {
    site: ["صفحة على استضافة مجانية", "أي شخص ينشئ صفحة هنا خلال دقائق وبلا تحقق من هويته. اسم المنصّة موثوق، لكن الصفحة نفسها ليست كذلك.", 15],
    bucket: ["صفحة مرفوعة على مخزن ملفات سحابي", "مخازن Google و Amazon و Microsoft يرفع إليها أي شخص صفحة HTML، فيبدأ رابط التصيد باسم شركة موثوقة. الشركات لا تضع صفحات الدخول هنا.", 25],
    tunnel: ["رابط نفق مؤقت إلى حاسوب شخصي", "هذه الخدمات تربط الإنترنت بحاسوب شخص ما مباشرة، ويستعملها المخترقون لصفحات تصيد تختفي بعد ساعات.", 35],
    ddns: ["نطاق ديناميكي مجاني (DDNS)", "يشير إلى حاسوب شخصي عنوانه متغيّر. شائع جداً في برامج التجسس وصفحات التصيد.", 30],
    ipfs: ["صفحة على شبكة IPFS", "محتوى مجهول الناشر لا يمكن حذفه، ولذلك يفضّله المحتالون لصفحات تسجيل الدخول المزيفة.", 30],
    file: ["رابط ملف على خدمة مشاركة ملفات", "الخدمة معروفة، لكن الملف يرفعه أي شخص. لا تفتح ملفاً لم تطلبه.", 12],
    form: ["استمارة أو سكربت ينشئه أي شخص", "استمارات Google وأمثالها تُستعمل لسرقة كلمات المرور وأرقام البطاقات. الشركات لا تطلب كلمة مرورك باستمارة.", 12],
    bio: ["صفحة روابط شخصية", "صفحة يجمع فيها صاحبها روابطه. الخطر في الروابط التي بداخلها لا فيها.", 5],
    paste: ["نص ينشره أي شخص", "مواقع لصق النصوص لا تتحقق من محتواها.", 10]
  };

  /* العلامات: names كلمات الانتحال، domains النطاقات الرسمية، weak = اسم قصير أو كلمة عامة (يحتاج قرينة ثانية) */
  const B = (id, ar, names, domains, o = {}) => ({ id, ar, names: names.split(" "), domains: domains.split(" "), ...o });
  const BRANDS = [
    B("instagram", "إنستغرام", "instagram", "instagram.com cdninstagram.com ig.me instagr.am"),
    B("facebook", "فيسبوك", "facebook messenger", "facebook.com fb.com fb.me fb.watch messenger.com fbcdn.net m.me fbsbx.com facebook.net"),
    B("meta", "ميتا", "meta", "meta.com meta.ai facebook.com metastatus.com", { weak: true }),
    B("whatsapp", "واتساب", "whatsapp", "whatsapp.com wa.me whatsapp.net"),
    B("google", "غوغل", "google gmail youtube", "goo.gl youtube.com youtu.be gmail.com googleusercontent.com gstatic.com googleapis.com withgoogle.com g.co android.com blogger.com forms.gle page.link google youtube-nocookie.com ggpht.com googlevideo.com", { re: /(^|\.)google\.(com?\.)?[a-z]{2,3}$/ }),
    B("apple", "أبل", "apple icloud itunes appleid", "apple.com icloud.com me.com apple.co itunes.com cdn-apple.com apple.news", { weak: ["apple"] }),
    B("microsoft", "مايكروسوفت", "microsoft outlook office365 onedrive hotmail sharepoint microsoftonline xbox skype office", "microsoft.com microsoftonline.com live.com outlook.com office.com office365.com microsoft365.com sharepoint.com windows.com windows.net azure.com bing.com msn.com skype.com xbox.com hotmail.com onedrive.com 1drv.ms aka.ms msft.net office.net microsoftstore.com", { weak: ["office"] }),
    B("paypal", "باي بال", "paypal", "paypal.com paypal.me paypalobjects.com"),
    B("netflix", "نتفليكس", "netflix", "netflix.com nflxext.com nflximg.net nflxvideo.net"),
    B("amazon", "أمازون", "amazon", "amazonaws.com amzn.to amzn.com primevideo.com a.co media-amazon.com aboutamazon.com amazon.jobs amazon.science", { re: /(^|\.)amazon\.(com|ae|sa|eg|de|fr|it|es|ca|in|nl|se|pl|sg|co\.uk|co\.jp|com\.tr|com\.au|com\.br|com\.mx|com\.be)$/ }),
    B("tiktok", "تيك توك", "tiktok", "tiktok.com tiktokcdn.com tiktokv.com"),
    B("telegram", "تليغرام", "telegram", "telegram.org t.me telegram.me telegra.ph telesco.pe tdesktop.com telegram.dog"),
    B("snapchat", "سناب شات", "snapchat", "snapchat.com snap.com sc-cdn.net"),
    B("twitter", "إكس (تويتر)", "twitter", "twitter.com x.com t.co twimg.com"),
    B("binance", "بينانس", "binance", "binance.com binance.us binance.org bnbchain.org"),
    B("discord", "ديسكورد", "discord", "discord.com discord.gg discordapp.com discordapp.net discord.media discordstatus.com"),
    B("steam", "ستيم", "steam steamcommunity steampowered", "steampowered.com steamcommunity.com steamstatic.com steamusercontent.com", { weak: ["steam"] }),
    B("linkedin", "لينكد إن", "linkedin", "linkedin.com lnkd.in licdn.com"),
    B("yahoo", "ياهو", "yahoo", "yahoo.com yimg.com yahoo.co.jp ymail.com"),
    B("github", "غيت هب", "github", "github.com github.io githubusercontent.com githubassets.com github.blog"),
    B("dropbox", "دروب بوكس", "dropbox", "dropbox.com dropboxusercontent.com db.tt"),
    B("spotify", "سبوتيفاي", "spotify", "spotify.com scdn.co spotify.link"),
    B("roblox", "روبلوكس", "roblox robux", "roblox.com rbxcdn.com"),
    B("epicgames", "إيبك غيمز", "epicgames fortnite", "epicgames.com fortnite.com unrealengine.com"),
    B("playstation", "بلايستيشن", "playstation", "playstation.com sony.com sonyentertainmentnetwork.com"),
    B("pubg", "ببجي", "pubg pubgmobile", "pubg.com pubgmobile.com krafton.com midasbuy.com"),
    B("freefire", "فري فاير", "freefire garena", "garena.com freefiremobile.com"),
    B("coinbase", "كوين بيس", "coinbase", "coinbase.com"),
    B("metamask", "ميتاماسك", "metamask", "metamask.io"),
    B("trustwallet", "ترست والت", "trustwallet", "trustwallet.com"),
    B("okx", "OKX", "bybit kucoin", "okx.com bybit.com kucoin.com"),
    B("visa", "فيزا", "visa mastercard", "visa.com mastercard.com visa.com.iq", { weak: ["visa"] }),
    B("westernunion", "ويسترن يونيون", "westernunion moneygram", "westernunion.com moneygram.com"),
    B("dhl", "DHL", "dhl fedex aramex usps", "dhl.com dhl.de fedex.com aramex.com usps.com", { weak: ["dhl", "usps"] }),
    B("shein", "شي إن", "shein aliexpress temu", "shein.com aliexpress.com aliexpress.us temu.com alibaba.com"),
    B("booking", "بوكينغ", "booking airbnb", "booking.com airbnb.com", { weak: ["booking"] }),
    B("ebay", "إيباي", "ebay", "ebay.com ebay.co.uk ebay.de"),
    B("openai", "ChatGPT", "chatgpt openai", "openai.com chatgpt.com oaiusercontent.com"),
    B("samsung", "سامسونغ", "samsung", "samsung.com samsungcloud.com"),
    B("docusign", "DocuSign", "docusign wetransfer", "docusign.com docusign.net wetransfer.com we.tl"),
    B("zoom", "زووم", "zoom", "zoom.us zoom.com zoomgov.com", { weak: true }),
    B("adobe", "أدوبي", "adobe", "adobe.com adobe.io adobelogin.com"),
    B("wikipedia", "ويكيبيديا", "wikipedia", "wikipedia.org wikimedia.org"),
    // العراق
    B("zaincash", "زين كاش", "zaincash", "zaincash.iq"),
    B("zain", "زين", "zain", "zain.com zaincash.iq", { weak: true, re: /(^|\.)zain\.com$/ }),
    B("asiacell", "آسياسيل", "asiacell asiahawala", "asiacell.com asiahawala.com"),
    B("korek", "كورك", "korek korektel", "korektel.com"),
    B("qicard", "كي كارد", "qicard superqi", "qi.iq qicard.iq"),
    B("fastpay", "فاست باي", "fastpay", "fast-pay.iq fastpay.iq"),
    B("fib", "المصرف العراقي الأول", "firstiraqibank", "fib.iq"),
    B("rafidain", "مصرف الرافدين", "rafidain rafidainbank", "rafidain-bank.gov.iq rb.iq"),
    B("rasheed", "مصرف الرشيد", "rasheedbank", "rasheedbank.gov.iq"),
    B("nasswallet", "ناس والت", "nasswallet", "nw.iq nasswallet.com"),
    B("earthlink", "إيرثلنك", "earthlink", "earthlink.iq"),
    B("talabat", "طلبات", "talabat toters careem", "talabat.com totersapp.com careem.com")
  ];
  const isWeak = (b, n) => b.weak === true || (Array.isArray(b.weak) && b.weak.includes(n)) || n.length < 5;
  const FUZZY_OK = S("finance finances discard telegraf telegraph paypay goggles amazing amazonia spotty snapshot");

  const WORDS = S(`login log-in signin sign-in logon verify verification verified validate validation account accounts update secure security confirm confirmation password passwd wallet bank banking free gift
    prize bonus winner reward rewards claim unlock unlocked suspend suspended locked recovery recover support billing invoice payment refund airdrop giveaway copyright appeal badge nitro robux vbucks
    diamonds coins hack generator followers likes kyc connect restore customs parcel delivery tracking salary grant recharge topup lucky spin promo voucher coupon cashback auth authenticate otp
    2fa helpdesk webmail webscr iphone win won money cash earn crypto invest profit bitcoin usdt mining`);
  const TRACKING = /^(utm_\w+|fbclid|gclid|dclid|gbraid|wbraid|gad_source|gclsrc|igshid|igsh|mc_cid|mc_eid|_ga|_gl|_hsenc|_hsmi|__hssc|__hstc|__hsfp|hsCtaTracking|yclid|ymclid|msclkid|ttclid|twclid|li_fat_id|si|ref_src|ref_url|s_cid|mkt_tok|spm|share_id|__tn__|__cft__\[\d\]|rcm|vero_id|vero_conv|oly_anon_id|oly_enc_id|_openstat|wickedid|mibextid|rdid|share_url|sfnsn|scid|ICID|icid|trk|trkCampaign|sc_campaign|srsltid|pk_campaign|pk_kwd|pk_source|pk_medium|oref|feature)$/;
  const EXT_EXEC = S(`apk xapk apks aab exe scr bat cmd msi msix appx vbs vbe jar ps1 psm1 dmg pkg pif hta lnk jse wsf wsh cpl dll reg ipa deb rpm sh run bin gadget msc chm mobileconfig application`);
  const EXT_ARCH = S(`zip rar 7z iso img cab gz tar tgz ace arj xz vhd vhdx`);
  const EXT_MACRO = S(`docm xlsm pptm xlsb dotm xlam one ppam`);
  const EXT_DECOY = /\.(pdf|docx?|xlsx?|pptx?|jpe?g|png|gif|txt|mp4|mp3|mov|csv)\.[a-z0-9]{2,6}$/i;
  const REDIR_PARAMS = /^(url|u|q|to|target|dest|destination|redirect|redirect_uri|redirect_url|redirecturl|redir|r|next|continue|return|returnurl|return_url|return_to|returnto|goto|go|link|out|uddg|z|rurl|forward|location|ref_url|page|site|jump|href|data|d|redirect_to|callback|service|successurl|origin|image_url)$/i;
  const SHARERS = /(sharer|share|intent\/(tweet|post)|shareArticle|pin\/create|send\?|\/submit|addtoany|translate)/i;
  const SCHEME_DANGER = S("javascript data vbscript blob file");
  const SCHEME_APP = { mailto: "يفتح رسالة بريد", tel: "يتصل برقم", sms: "يرسل رسالة نصية", tg: "يفتح تليغرام", whatsapp: "يفتح واتساب", viber: "يفتح فايبر", intent: "يشغّل تطبيقاً على أندرويد", market: "يفتح متجر التطبيقات", "itms-services": "يثبّت تطبيقاً على آيفون من خارج المتجر", "ms-msdt": "يشغّل أداة في ويندوز", "ms-officecmd": "يشغّل أوفيس", "search-ms": "يفتح بحث ويندوز", zoommtg: "يفتح زووم", fb: "يفتح فيسبوك", instagram: "يفتح إنستغرام", magnet: "يبدأ تحميل تورنت", ssh: "يفتح اتصالاً بخادم", smb: "يفتح مشاركة ملفات" };

  /* ---------- أدوات ---------- */
  const INVISIBLE = /[­​-‏‪-‮⁠-⁩﻿]/g;
  const isIPv4 = (h) => /^\d{1,3}(\.\d{1,3}){3}$/.test(h);
  const isPrivateIP = (h) => /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(h);

  // Punycode (RFC 3492) → Unicode
  function punyDecode(input) {
    const base = 36, tMin = 1, tMax = 26, skew = 38, damp = 700; let n = 128, i = 0, bias = 72; const out = [];
    const b = input.lastIndexOf("-");
    for (let j = 0; j < Math.max(b, 0); j++) out.push(input.charCodeAt(j));
    for (let idx = b > 0 ? b + 1 : 0; idx < input.length;) {
      const oldi = i;
      for (let w = 1, k = base; ; k += base) {
        if (idx >= input.length) return null;
        const c = input.charCodeAt(idx++); const digit = c - 48 < 10 ? c - 22 : c - 65 < 26 ? c - 65 : c - 97 < 26 ? c - 97 : base;
        if (digit >= base) return null;
        i += digit * w; const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias; if (digit < t) break; w *= base - t;
      }
      const len = out.length + 1; let delta = i - oldi; delta = oldi === 0 ? Math.floor(delta / damp) : delta >> 1; delta += Math.floor(delta / len);
      let k = 0; for (; delta > ((base - tMin) * tMax) >> 1; k += base) delta = Math.floor(delta / (base - tMin));
      bias = k + Math.floor(((base - tMin + 1) * delta) / (delta + skew));
      n += Math.floor(i / len); i %= len; out.splice(i++, 0, n);
    }
    return String.fromCodePoint(...out);
  }
  const toUnicode = (host) => host.split(".").map((l) => (l.startsWith("xn--") ? punyDecode(l.slice(4)) || l : l)).join(".");

  // حروف من أبجديات أخرى تشبه اللاتينية
  const CONF = { "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "х": "x", "у": "y", "і": "i", "ј": "j", "ѕ": "s", "һ": "h", "ԁ": "d", "ԛ": "q", "ԝ": "w", "к": "k", "м": "m", "т": "t", "в": "b", "н": "h", "г": "r", "ь": "b", "ӏ": "l", "Ӏ": "l", "п": "n", "и": "u", "ё": "e", "є": "e", "ї": "i", "ɩ": "i",
    "ο": "o", "α": "a", "ν": "v", "ρ": "p", "τ": "t", "ι": "i", "κ": "k", "ε": "e", "υ": "u", "χ": "x", "γ": "y", "η": "n", "ω": "w", "β": "b", "μ": "u", "ϲ": "c", "ϳ": "j",
    "ı": "i", "ɑ": "a", "ɡ": "g", "ƅ": "b", "ǀ": "l", "ł": "l", "ø": "o", "đ": "d", "ħ": "h", "ɛ": "e", "ʏ": "y", "ꜱ": "s", "ᴀ": "a", "ᴄ": "c", "ᴇ": "e", "ᴏ": "o", "ᴘ": "p", "ᴛ": "t", "ᴜ": "u", "ɴ": "n", "ʀ": "r", "ɪ": "i", "ʟ": "l", "ß": "b", "ƿ": "p", "ȷ": "j", "ⅼ": "l", "ｏ": "o" };
  const unicodeSkeleton = (s) => [...s.normalize("NFD").replace(/[̀-ͯ]/g, "")].map((c) => CONF[c] || c).join("");
  const scriptsOf = (label) => {
    const set = new Set();
    for (const c of label) {
      if (/[a-z]/i.test(c)) set.add("latin"); else if (/[Ѐ-ԯ]/.test(c)) set.add("cyrillic"); else if (/[Ͱ-Ͽ]/.test(c)) set.add("greek");
      else if (/[؀-ۿݐ-ݿ]/.test(c)) set.add("arabic"); else if (/[0-9-]/.test(c)) { /* neutral */ } else set.add("other");
    }
    return set;
  };
  // استبدال أرقام وحروف متشابهة شكلاً: paypa1، rnicrosoft، googIe
  const skel = (s) => s.replace(/rn/g, "m").replace(/vv/g, "w").replace(/cl/g, "d").replace(/[0-9i|]/g, (c) => ({ 0: "o", 1: "l", 3: "e", 4: "a", 5: "s", 7: "t", 8: "b", 9: "g", i: "l", "|": "l" }[c] || c));
  const collapse = (s) => s.replace(/(.)\1+/g, "$1");
  function editDistance(a, b, max) { // Damerau-Levenshtein
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev2 = null, prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
      }
      prev2 = prev; prev = cur;
    }
    return prev[b.length];
  }

  const officialOf = (host) => BRANDS.find((b) => b.domains.some((d) => host === d || host.endsWith("." + d)) || (b.re && b.re.test(host))) || null;
  const platformOf = (host) => PLATFORMS.find((p) => host === p.s || host.endsWith("." + p.s)) || null;

  function splitHost(host) {
    if (isIPv4(host) || host.startsWith("[")) return { reg: host, suffix: "", sld: host, subs: [] };
    const p = host.split("."); const plat = platformOf(host);
    let n = 1;
    if (plat && host !== plat.s && !["sites.google.com", "docs.google.com", "drive.google.com", "script.google.com", "storage.googleapis.com", "firebasestorage.googleapis.com", "dropbox.com", "telegra.ph", "forms.gle"].includes(plat.s)) n = plat.s.split(".").length;
    else if (p.length >= 3 && p[p.length - 1].length === 2 && SLD2.has(p[p.length - 2])) n = 2;
    const cut = Math.max(0, p.length - n - 1);
    return { reg: p.slice(cut).join("."), suffix: p.slice(-n).join("."), sld: p[cut] || "", subs: p.slice(0, cut), tld: p[p.length - 1] };
  }

  /* رابط «معطّل» (hxxp، [.]) ← رابط عادي؛ ونص رسالة ← الروابط التي فيه */
  function refang(s) {
    return s.replace(/^h(xx|\*\*|tt)ps?(\[:\]|:)\/\//i, (m) => (/s/i.test(m.slice(4, 6)) ? "https://" : "http://")).replace(/\[\.\]|\(\.\)|\[dot\]|\(dot\)|\{\.\}/gi, ".").replace(/\[:\]/g, ":").replace(/\[\/\]/g, "/");
  }
  function extract(text) {
    const t = String(text || "").trim();
    if (!/\s/.test(t)) return t ? [t] : [];
    const found = t.match(/(?:[a-z][a-z0-9+.-]{1,15}:\/\/|www\.)[^\s<>"'،؛]+|(?:[a-z0-9-]+(?:\[\.\]|\.))+[a-z]{2,}(?:\/[^\s<>"'،؛]*)?/gi) || [];
    const clean = [...new Set(found.map((u) => u.replace(/[)\].,!?؟»]+$/, "")))];
    return clean.length ? clean : [t.replace(/\s+/g, "")];
  }
  const defang = (u) => String(u).replace(/^http/i, "hxxp").replace(/\./g, "[.]");

  /* ---------- التحليل ---------- */
  function analyze(raw, depth = 0) {
    const flags = []; const add = (id, lvl, icon, t, d, pts, extra) => flags.push({ id, lvl, icon, t, d, pts, ...extra });
    let input = String(raw || "").trim().replace(/^[<"'«(\[]+|[>"'»)\]]+$/g, "");
    if (!input) return null;

    if (INVISIBLE.test(input)) {
      const rlo = /[‪-‮⁦-⁩]/.test(input);
      add("invisible", rlo ? "danger" : "warn", "eye-off", rlo ? "حروف تحكّم تقلب اتجاه النص" : "حروف غير مرئية داخل الرابط", rlo ? "تُستعمل لإظهار الرابط بشكل مختلف عن حقيقته (مثلاً exe تبدو pdf)." : "حروف لا تُرى زُرعت في الرابط، غالباً لتجاوز فلاتر الحماية.", rlo ? 50 : 25);
      input = input.replace(INVISIBLE, "");
    }
    const fanged = refang(input);
    if (fanged !== input) { add("defanged", "info", "wrench", "الرابط كان معطّلاً (hxxp أو [.])", "أعدناه إلى شكله الحقيقي لتحليله. هكذا يكتب الباحثون الروابط الخبيثة كي لا تُفتح بالخطأ.", 0); input = fanged; }

    const hadScheme = /^[a-z][a-z0-9+.-]*:/i.test(input) && !/^[a-z0-9.-]+:\d{1,5}(\/|$)/i.test(input);
    const scheme = hadScheme ? input.slice(0, input.indexOf(":")).toLowerCase() : "";
    const base = { input, flags, depth, nested: [], trackers: [] };

    if (scheme && SCHEME_DANGER.has(scheme)) {
      add("scheme", "danger", "octagon-alert", `ليس رابط موقع، بل شيفرة أو ملف (${scheme}:)`, scheme === "file" ? "يفتح ملفاً من جهازك نفسه. لا يرسله موقع محترم." : "روابط javascript و data تنفّذ شيفرة داخل متصفحك أو تعرض صفحة مزيفة بلا عنوان. لا تفتحه أبداً.", 95);
      return finish({ ...base, special: "scheme", scheme, label: scheme + ":" });
    }
    if (scheme && !/^(https?|ftps?|sftp|wss?)$/.test(scheme)) {
      const what = SCHEME_APP[scheme];
      const hot = /^(intent|itms-services|ms-msdt|ms-officecmd|search-ms|smb|ssh)$/.test(scheme);
      add("app-scheme", hot ? "danger" : "warn", "app-window", `رابط ${what || "يفتح تطبيقاً على جهازك"} (${scheme}:)`, hot ? "هذا النوع استُعمل فعلاً لتثبيت برامج خبيثة أو سرقة بيانات الدخول. لا تفتحه إلا من مصدر تعرفه." : "ليس صفحة ويب. تأكد ممّن أرسله قبل فتحه.", hot ? 60 : what ? 10 : 30);
      const inner = /^intent:/i.test(input) && (input.match(/S\.browser_fallback_url=([^;]+)/) || [])[1];
      const res = { ...base, special: "app", scheme, label: scheme + ":" };
      if (inner && depth < 2) { const n = analyze(decodeURIComponent(inner), depth + 1); if (n) res.nested.push({ via: "رابط بديل داخل intent", r: n }); }
      return finish(res);
    }

    // السلطة الخام (قبل أن يطبّعها المتصفح) تكشف الحيل
    const noScheme = hadScheme ? input.replace(/^[a-z][a-z0-9+.-]*:\/*/i, "") : input.replace(/^\/+/, "");
    const rawAuth = noScheme.split(/[/?#]/)[0];
    const rawHost = rawAuth.slice(rawAuth.lastIndexOf("@") + 1).replace(/:\d+$/, "");
    if (/\\/.test(noScheme.split(/[?#]/)[0].slice(0, rawAuth.length + 2)) || /\\/.test(rawAuth)) add("backslash", "warn", "slash", "شرطة مائلة معكوسة (\\) داخل العنوان", "المتصفحات والتطبيقات تقرؤها بطرق مختلفة، فيظهر لك موقع ويُفتح موقع آخر.", 30);

    let u; try { u = new URL((hadScheme ? "" : "https://") + (hadScheme ? input : noScheme)); } catch { return { error: "هذا لا يبدو رابطاً صحيحاً. الصق الرابط كاملاً كما وصلك." }; }
    const host = u.hostname.toLowerCase().replace(/\.$/, "");
    if (!host || (!host.includes(".") && !host.startsWith("[") && host !== "localhost")) return { error: "هذا لا يبدو رابطاً صحيحاً. الصق الرابط كاملاً كما وصلك." };
    const ip4 = isIPv4(host), ip6 = host.startsWith("["), isIP = ip4 || ip6;
    const hostU = toUnicode(host);
    const parts = splitHost(host); const { reg, sld, subs } = parts; const tld = isIP ? "" : host.split(".").pop();
    const official = isIP ? null : officialOf(host);
    const platform = isIP ? null : platformOf(host);
    const trusted = !!official && !platform;

    // البروتوكول
    if (u.protocol === "http:" && hadScheme) add("http", "warn", "lock-open", "اتصال غير مشفّر (http)", "أي شيء تكتبه في هذه الصفحة يمكن اعتراضه. المواقع الجادّة كلها تستخدم https.", trusted ? 0 : 15);
    else if (/^(ftp|sftp|ftps|ws|wss):$/.test(u.protocol)) add("ftp", "warn", "hard-drive-download", `بروتوكول نقل ملفات أو اتصال مباشر (${u.protocol})`, "ليس صفحة ويب عادية، وغالباً ينتهي بتحميل ملف.", 30);
    else if (u.protocol === "https:" && hadScheme) add("https", "ok", "lock", "اتصال مشفّر (https)", "جيد، لكنه ليس دليلاً على الأمان: معظم مواقع التصيد اليوم تستخدم https أيضاً.", 0);

    // عنوان IP
    if (isIP) {
      const obf = ip4 && rawHost.toLowerCase() !== host;
      if (obf) add("ip-obf", "danger", "server-crash", "عنوان IP مموّه بصيغة رقمية غريبة", `كُتب «${rawHost}» بدل ${host} لإخفاء أنه عنوان IP. لا يفعل هذا موقع محترم.`, 60);
      else if (ip4 && isPrivateIP(host)) add("ip-private", "warn", "router", "عنوان داخل شبكتك المحلية", "هذا عنوان جهاز في شبكتك (راوتر مثلاً) وليس موقعاً على الإنترنت. إن وصلك من غريب فلا تفتحه.", 25);
      else add("ip", "danger", "server", "الرابط عنوان IP وليس اسم موقع", "المواقع الحقيقية لها أسماء. الأرقام المجرّدة تُستعمل لخوادم مؤقتة أو مخترقة.", 45);
    } else {
      if (/%[0-9a-f]{2}/i.test(rawHost)) add("host-encoded", "danger", "binary", "اسم الموقع مكتوب بترميز (%)", "ترميز اسم الموقع نفسه حيلة لإخفائه عن العين وعن الفلاتر.", 35);
      else if (/[^\x00-\x7f]/.test(rawHost) && !host.includes("xn--") && rawHost.toLowerCase() !== host) add("host-fancy", "warn", "type", "حروف مزخرفة تتحوّل إلى اسم موقع آخر", `كُتب «${rawHost}» ويفتح فعلياً ${host}. حيلة لتجاوز فلاتر الرسائل.`, 30);
    }

    // @ قبل اسم الموقع
    if (u.username || u.password) {
      const fake = decodeURIComponent(u.username || "");
      const looks = /\.[a-z]{2,}/i.test(fake);
      add("userinfo", "danger", "at-sign", looks ? `يتظاهر بأنه ${fake.replace(/[/\\].*/, "")}` : "يحتوي على @ قبل اسم الموقع", `كل ما قبل @ يتجاهله المتصفح. الموقع الذي سيُفتح فعلاً هو ${reg}.`, looks ? 65 : 45);
    }

    // أسماء بحروف غير لاتينية (IDN / Punycode)
    let hostForBrand = host; let idnHit = false;
    if (!isIP && hostU !== host) {
      const labels = hostU.split("."); const sk = unicodeSkeleton(hostU);
      const mixed = labels.some((l) => { const s = scriptsOf(l); return s.has("latin") && (s.has("cyrillic") || s.has("greek")); });
      const allScripts = new Set(labels.flatMap((l) => [...scriptsOf(l)]));
      const fakeLatin = /^[a-z0-9.-]+$/.test(sk);
      if (mixed) { add("idn-mixed", "danger", "languages", "حروف من أبجديتين مختلطتين في اسم واحد", `الاسم الحقيقي «${hostU}» يخلط حروفاً لاتينية بحروف روسية أو يونانية تشبهها تماماً. هذه خدعة التصيد المعروفة بـ homograph.`, 55); idnHit = true; }
      else if (fakeLatin && (allScripts.has("cyrillic") || allScripts.has("greek") || allScripts.has("other"))) { add("idn-look", "danger", "languages", "اسم مكتوب بحروف أجنبية تشبه الإنجليزية", `يُعرض «${hostU}» ويبدو مثل «${sk}»، لكنه نطاق مختلف تماماً.`, 50); idnHit = true; }
      else if (allScripts.has("arabic") && allScripts.size === 1) add("idn-ar", "info", "languages", "اسم موقع بحروف عربية", `الاسم هو «${hostU}». هذا مسموح وطبيعي، لكن تأكد من أنه الموقع الذي تقصده.`, 0);
      else add("idn", "warn", "languages", "اسم موقع بحروف غير إنجليزية (Punycode)", `الاسم الحقيقي هو «${hostU}». تأكد حرفاً حرفاً من أنه ما تقصده.`, 12);
      if (fakeLatin) hostForBrand = sk;
    }

    // مختصِرات ومسجّلات IP
    const logger = IP_LOGGERS.has(reg) || IP_LOGGERS.has(host);
    const shortener = !logger && (SHORTENERS.has(reg) || SHORTENERS.has(host));
    if (logger) add("iplogger", "danger", "map-pin", "رابط تتبّع يسجّل عنوان IP وموقعك", "هذه الخدمة صُمّمت لمعرفة مكان من يضغط على الرابط ونوع جهازه، ثم تحويله إلى صفحة عادية كي لا يشكّ.", 65);
    if (shortener) add("shortener", "warn", "shrink", "رابط مختصر يخفي وجهته", "لا يمكن معرفة أين يأخذك من شكله. نحاول كشف الوجهة الحقيقية في الفحص الحي أدناه.", 20);

    // منصّات النشر المفتوح
    if (platform) {
      const [t, d, pts] = PLATFORM_AR[platform.kind];
      const formOnly = platform.s === "docs.google.com" && !/^\/(forms|presentation|drawings)\b/.test(u.pathname);
      if (!formOnly) add("platform", pts >= 30 ? "danger" : "warn", platform.kind === "file" ? "file-down" : "blocks", `${t} (${platform.s})`, d, pts);
    }

    // امتداد النطاق
    if (!isIP && !trusted) {
      if (TLD_HIGH.has(tld)) add("tld", "warn", "globe", `امتداد يكثر استعماله في الاحتيال (.${tld})`, tld === "zip" || tld === "mov" ? "هذا الامتداد يشبه نوع ملف، فيُستعمل لإيهامك أنك تفتح ملفاً لا موقعاً." : "ليس كل موقع بهذا الامتداد احتيالياً، لكنه رخيص أو مجاني ولذلك يفضّله المحتالون.", tld === "zip" || tld === "mov" ? 25 : 15);
      else if (TLD_MED.has(tld) && !platform) add("tld-med", "info", "globe", `امتداد رخيص شائع (.${tld})`, "يستعمله كثير من المواقع العادية، ويستعمله المحتالون أيضاً. قرينة ضعيفة وحدها.", 5, { weak: true });
    }

    /* ----- انتحال العلامات ----- */
    const hb = hostForBrand; const pb = splitHost(hb);
    const regTokens = pb.sld.split("-").filter(Boolean); const subTokens = pb.subs.flatMap((l) => l.split("-")).filter(Boolean);
    const sldFlat = pb.sld.replace(/-/g, "");
    let brandHit = null; const setHit = (h) => { if (!brandHit || h.pts > brandHit.pts) brandHit = h; };
    if (!isIP && !trusted) {
      const coSignal = () => flags.some((f) => ["tld", "platform", "http", "shortener"].includes(f.id)) || [...regTokens, ...subTokens].some((t) => WORDS.has(t));
      for (const b of BRANDS) {
        if (official && official.id === b.id) continue;
        // example: paypal.com.evil.ru  /  instagram.com-verify.xyz
        const asDomain = b.domains.find((d) => d.includes(".") && d.length >= 5 && (hb.startsWith(d + ".") || hb.includes("." + d + ".") || hb.startsWith(d + "-") || hb.includes("." + d + "-")));
        if (asDomain) { setHit({ b, pts: 65, why: `يبدأ بـ «${asDomain}» ليبدو رسمياً، لكن هذا مجرد جزء من اسم موقع آخر` }); continue; }
        for (const n of b.names) {
          const weak = isWeak(b, n);
          if (regTokens.includes(n) || sldFlat === n) setHit({ b, weakHit: weak && !idnHit && !coSignal(), pts: idnHit ? 70 : weak ? (coSignal() ? 45 : 25) : 50, why: `يحمل اسم «${n}» وليس من نطاقاته الرسمية` });
          else if (subTokens.includes(n) && !weak) setHit({ b, pts: 45, why: `يضع اسم «${n}» في النطاق الفرعي ليخدعك` });
          else if (!weak && n.length >= 6 && (sldFlat.includes(n) || pb.subs.some((l) => l.replace(/-/g, "").includes(n)))) setHit({ b, pts: 38, soft: true, why: `اسم «${n}» مدسوس داخل اسم موقع آخر` });
          else {
            const cand = [...regTokens, sldFlat, ...subTokens].filter((t) => t.length >= 4 && t !== n);
            const sn = skel(n);
            if (cand.some((t) => t !== n && skel(t) === sn)) setHit({ b, pts: 60, why: `يقلّد «${n}» بحروف وأرقام متشابهة شكلاً` });
            else if (n.length >= 6 && skel(sldFlat) !== sldFlat && skel(sldFlat).includes(sn) && !sldFlat.includes(n)) setHit({ b, pts: 50, why: `يقلّد «${n}» بحروف وأرقام متشابهة شكلاً` });
            else if (n.length >= 6 && !weak) {
              const max = n.length >= 10 ? 2 : 1;
              const near = [...regTokens, sldFlat].find((t) => t.length >= 5 && !FUZZY_OK.has(t) && Math.abs(t.length - n.length) <= max && (collapse(t) === collapse(n) || editDistance(skel(t), sn, max) <= max));
              if (near) setHit({ b, pts: 45, soft: true, why: `«${near}» يختلف عن «${n}» بحرف واحد تقريباً` });
            }
          }
        }
      }
      if (brandHit) {
        const { b, pts, why, soft, weakHit } = brandHit;
        add("brand", pts >= 40 ? "danger" : "warn", "venetian-mask", `ينتحل «${b.ar}»`, `${why}. الموقع الرسمي هو ${b.domains[0]}، أما هذا الرابط فيفتح ${reg}.`, pts, { brand: b.id, weak: !!(soft || weakHit) });
      }
      // كلمة tld داخل الاسم: login.com-secure.xyz
      const inner = [...subs.flatMap((l) => l.split("-")), ...sld.split("-")];
      if (!brandHit && inner.some((t) => /^(com|net|org|gov|edu)$/.test(t)) && !platform) add("fake-tld", "warn", "split", "«.com» في غير مكانها", `كلمة com أو net جزء من الاسم لا نهايته. النطاق الحقيقي هو ${reg}.`, 20);
      if (/^www\d*[a-z]/.test(sld) && sld.length > 6) add("www-glued", "warn", "type", "«www» ملتصقة باسم الموقع", "مثل wwwpaypal.com: نطاق مختلف يقلّد شكل العنوان الطبيعي.", 15);
    }
    if (official && !platform) add("official", "ok", "badge-check", `نطاق رسمي لـ «${official.ar}»`, `${reg} من النطاقات الرسمية المعروفة. انتبه فقط إلى أن الحسابات والصفحات داخله ينشئها أي شخص.`, 0);

    // بنية اسم الموقع
    if (!isIP) {
      if (subs.length >= 4) add("subdomains", "warn", "layers", "سلسلة طويلة من النطاقات الفرعية", "مثل secure.login.account.example.xyz. تُستعمل لدفع اسم الموقع الحقيقي خارج الشاشة، خصوصاً في الهاتف.", 15);
      if (!trusted && (hostU.match(/-/g) || []).length >= 3) add("hyphens", "warn", "minus", "شرطات كثيرة في اسم الموقع", "مثل account-verify-secure-login.com. نمط شائع جداً في نطاقات التصيد.", 10);
      if (host.length > 60) add("long-host", "warn", "ruler", "اسم موقع طويل جداً", "الأسماء الطويلة تخفي النطاق الحقيقي في آخرها.", 10);
      const s = sld.replace(/-/g, ""); const letters = s.replace(/[^a-z]/g, ""), digits = s.replace(/\D/g, "");
      const vowels = (letters.match(/[aeiouy]/g) || []).length; const switches = (s.match(/[a-z]\d|\d[a-z]/g) || []).length;
      if (!trusted && !platform && !host.includes("xn--") && ((letters.length >= 8 && /[^aeiouy\d]{6,}/.test(letters)) || (digits.length >= 3 && letters.length >= 3 && switches >= 3) || (letters.length >= 12 && vowels / letters.length < 0.22) || (digits.length >= 5 && letters.length <= 3 && s.length >= 6)))
        add("random", "warn", "shuffle", "اسم عشوائي لا معنى له", "نطاقات تُولَّد آلياً بالجملة وتُرمى بعد أيام. المواقع الحقيقية لها أسماء تُقرأ.", 12);
      if (u.port && !["80", "443"].includes(u.port)) add("port", "warn", "plug", `منفذ غير معتاد (${u.port})`, "المواقع العامة لا تستعمل منافذ مخصّصة. علامة خادم مؤقت أو لوحة تحكم.", 10);
    }

    /* ----- المسار والمعاملات ----- */
    let path = u.pathname, encodedLetters = (path.match(/%(4[1-9a-f]|5[0-9a]|6[1-9a-f]|7[0-9a]|3[0-9]|2e)/gi) || []).length;
    for (let i = 0; i < 2; i++) { try { const d = decodeURIComponent(path); if (d === path) break; path = d; } catch { break; } }
    const pathL = path.toLowerCase(); const queryL = (() => { try { return decodeURIComponent(u.search).toLowerCase(); } catch { return u.search.toLowerCase(); } })();
    if (encodedLetters >= 3) add("encoded", "warn", "binary", "كلمات مخفيّة بالترميز (%)", `حروف عادية كُتبت بصيغة %xx كي لا تُقرأ. بعد فكّها: ${path.slice(0, 80)}`, 20);
    if (/%25[0-9a-f]{2}/i.test(u.href)) add("double-enc", "warn", "binary", "ترميز مزدوج", "ترميز فوق ترميز، حيلة لتجاوز فلاتر الحماية.", 12);
    if (INVISIBLE.test(path)) add("invisible-path", "danger", "eye-off", "حروف مخفية في المسار", "تغيّر شكل اسم الملف الظاهر عن حقيقته.", 40);

    // ملفات خطرة: في المسار أو في المعاملات
    const fileNames = [pathL.split("/").pop(), ...[...u.searchParams.values()].map((v) => v.toLowerCase().split(/[/\\]/).pop()), u.hash.toLowerCase()].filter(Boolean);
    let fileHit = null;
    for (const f of fileNames) {
      const ext = (f.match(/\.([a-z0-9]{2,12})$/) || [])[1]; if (!ext) continue;
      const kind = EXT_EXEC.has(ext) ? "exec" : EXT_MACRO.has(ext) ? "macro" : EXT_ARCH.has(ext) ? "arch" : ext === "js" && f === fileNames[0] ? "js" : null;
      if (kind && (!fileHit || kind === "exec")) fileHit = { f, ext, kind, decoy: EXT_DECOY.test(f) };
    }
    if (fileHit) {
      const { ext, kind, decoy } = fileHit;
      const msg = { exec: ["يحمّل ملفاً تنفيذياً", "ملفات APK و EXE وأمثالها برامج تعمل على جهازك بكامل الصلاحيات. لا تثبّت تطبيقاً إلا من المتجر الرسمي.", 45], macro: ["يحمّل مستند أوفيس فيه ماكرو", "مستندات الماكرو تشغّل شيفرة عند فتحها. من أشهر طرق نشر الفيروسات.", 30], arch: ["يحمّل ملفاً مضغوطاً أو صورة قرص", "الملفات المضغوطة تُخفي ما بداخلها عن فحص الحماية. لا تفتح ما لم تطلبه.", 20], js: ["يشير إلى ملف شيفرة (js)", "ليس صفحة تُقرأ بل شيفرة برمجية.", 15] }[kind];
      add("file", kind === "exec" || kind === "macro" ? "danger" : "warn", "file-warning", `${msg[0]} (.${ext})`, msg[1], msg[2] + (trusted ? -15 : 0));
      if (decoy) add("double-ext", "danger", "file-x", "امتداد مزدوج لخداعك", `اسم الملف «${fileHit.f.slice(-40)}» يبدو مستنداً أو صورة، لكنه في الحقيقة ملف من نوع آخر.`, 25);
    }

    // موقع مخترق تُزرع فيه صفحة
    if (!trusted && /\/(wp-content|wp-includes|wp-admin)\/.+|\/\.well-known\/(?!acme-challenge|security\.txt|assetlinks\.json|apple-app-site-association|apple-developer)|\/cgi-bin\/|\/~[a-z0-9]+\//.test(pathL) && /\.(php|html?|aspx?)$|\/$/.test(pathL))
      add("compromised", "warn", "bug", "صفحة داخل مجلدات نظام الموقع", "صفحات التصيد تُزرع كثيراً في مجلدات مثل wp-content لمواقع مخترقة لا يعلم أصحابها.", 15);

    // ذكر علامة في المسار على موقع لا يخصّها
    if (!trusted && !brandHit && !isIP) {
      const pNoUrl = pathL.replace(/\/https?:\/.*$/, ""); const qNoUrl = queryL.replace(/(https?:)?\/\/[^\s&]+/g, " "); const ptoks = new Set((pNoUrl + " " + qNoUrl).split(/[^a-z0-9.]+/).filter(Boolean)); const ptext = pNoUrl + qNoUrl;
      const loginish = /(log-?in|sign-?in|verif|password|secure|account|recover|unlock|confirm|wallet|auth|webscr|billing|\.php|\.html?)/.test(pathL);
      for (const b of BRANDS) {
        if (official && official.id === b.id) continue;
        const dom = b.domains.find((d) => d.includes(".") && d.length >= 6 && ptext.includes(d));
        const nm = !dom && b.names.find((n) => !isWeak(b, n) && [...ptoks].some((t) => t === n || (n.length >= 6 && t.split(".").includes(n))));
        if (dom || nm) { add("brand-path", "warn", "venetian-mask", `يذكر «${b.ar}» في المسار وهو ليس موقعه`, `اسم ${dom || nm} يظهر بعد اسم الموقع لا فيه. ما بعد أول «/» يكتبه صاحب الموقع كما يشاء، والموقع الحقيقي هو ${reg}.`, platform ? 30 : dom || loginish ? 22 : 12, { brand: b.id, weak: !platform }); break; }
      }
    }

    // كلمات الاستعجال والإغراء
    if (!trusted) {
      const hw = [...new Set([...subs.flatMap((l) => l.split("-")), ...sld.split("-")].filter((t) => WORDS.has(t)))];
      const pw = [...new Set(pathL.split(/[^a-z0-9]+/).filter((t) => WORDS.has(t) && !hw.includes(t)))];
      const pts = Math.min(24, hw.length * 8) + Math.min(12, pw.length * 4);
      if (pts) add("words", hw.length >= 2 || pts >= 16 ? "warn" : "info", "text-search", "كلمات يكثر استعمالها في التصيد", `يحتوي على: ${[...hw, ...pw].slice(0, 6).join("، ")}. ${hw.length ? "وجودها في اسم الموقع نفسه أقوى دلالة من وجودها في المسار." : "وحدها لا تكفي للحكم."}`, pts, { weak: !hw.length });
    }

    // بريد إلكتروني داخل الرابط (تصيد موجَّه)
    const tail = queryL + " " + (() => { try { return decodeURIComponent(u.hash).toLowerCase(); } catch { return ""; } })();
    if (!trusted && /[a-z0-9._%+-]{2,}@[a-z0-9-]+\.[a-z]{2,}/.test(tail)) add("email", "warn", "mail-warning", "الرابط يحمل بريداً إلكترونياً", "صفحات التصيد الموجّه تملأ بريدك مسبقاً لتبدو حقيقية، وتؤكد للمحتال أن بريدك يعمل.", 18);

    /* ----- روابط داخل الرابط (إعادة التوجيه) ----- */
    const nested = []; const seen = new Set();
    const tryNested = (val, via, redirectLike) => {
      let v = String(val || "").trim(); for (let i = 0; i < 2 && /%[0-9a-f]{2}/i.test(v) && !/^https?:\/\//i.test(v); i++) { try { v = decodeURIComponent(v); } catch { break; } }
      let b64 = false;
      if (!/^(https?:)?\/\//i.test(v) && /^(a1)?[A-Za-z0-9_-]{16,}={0,2}$/.test(v)) {
        try { const d = atob(v.replace(/^a1/, "").replace(/-/g, "+").replace(/_/g, "/")); if (/^https?:\/\/[\x20-\x7e]+$/.test(d)) { v = d; b64 = true; } } catch { /* not base64 */ }
      }
      if (/^\/\/[a-z0-9-]+\./i.test(v)) v = "https:" + v;
      if (!/^https?:\/\/[^\s/]+\.[^\s/]+/i.test(v) || seen.has(v)) return;
      let nh; try { nh = new URL(v).hostname.toLowerCase(); } catch { return; }
      if (splitHost(nh).reg === reg) return;
      seen.add(v); nested.push({ url: v, via, redirectLike, b64 });
    };
    for (const [k, v] of u.searchParams) tryNested(v, `المعامل ${k}`, REDIR_PARAMS.test(k));
    if (/^\?https?:/i.test(u.search)) tryNested(u.search.slice(1), "بعد علامة الاستفهام", true);
    const inPath = path.match(/\/(https?:\/{1,2}[^\s]+)$/i) || path.match(/\/(https?%3a%2f%2f[^\s]+)$/i);
    if (inPath) tryNested(inPath[1].replace(/^(https?:)\/(?!\/)/i, "$1//"), "داخل المسار", true);
    if (u.hash.length > 8) tryNested(u.hash.slice(1), "بعد علامة #", false);
    const result = { ...base, url: u, href: u.href, scheme: u.protocol.replace(":", ""), host, hostU, reg, sld, subs, suffix: parts.suffix, tld, isIP, official, platform, trusted, shortener, logger, hadScheme };
    if (nested.length && depth < 2) {
      const first = nested.find((n) => n.redirectLike) || nested[0];
      const r = analyze(first.url, depth + 1);
      if (r && !r.error) {
        result.nested.push({ via: first.via, r, redirectLike: first.redirectLike });
        if (first.b64) add("b64", "warn", "binary", "رابط آخر مخفي بترميز Base64", `داخل الرابط وجهة مخفية: ${r.host}`, 15);
        const sharer = SHARERS.test(u.pathname + (u.hostname.startsWith("wa.") || u.hostname === "t.me" ? "send?" : ""));
        if (first.redirectLike && sharer) { first.redirectLike = false; result.nested[0].redirectLike = false; }
        if (first.redirectLike) add("redirect", "warn", "corner-up-right", `يحوّلك إلى موقع آخر: ${r.reg}`, trusted ? `${reg} هنا مجرد محطة عبور. المحتالون يستغلون ذلك ليبدأ الرابط باسم موثوق. حلّلنا الوجهة الحقيقية أدناه.` : "الرابط يحمل وجهة ثانية داخله وسينقلك إليها. حلّلناها أدناه.", trusted ? 20 : 15);
        else add("embedded", "info", "link-2", `يحمل رابطاً آخر بداخله: ${r.reg}`, "قد يكون رابط مشاركة عادياً. حلّلنا الرابط الداخلي أدناه للاحتياط.", 0);
      }
    }

    if (input.length > 300) add("long", "warn", "ruler", "رابط طويل جداً", "الروابط الطويلة تخفي الوجهة الحقيقية وتحمل بيانات تعريف عنك.", 8);
    else if (input.length > 150) add("long", "info", "ruler", "رابط طويل", "قد يحمل بيانات تتبّع أو يخفي جزءاً من العنوان.", 3, { weak: true });

    // أكواد التتبع
    const trackers = [...new Set([...u.searchParams.keys()].filter((k) => TRACKING.test(k)))];
    const cleanU = new URL(u.href); trackers.forEach((k) => cleanU.searchParams.delete(k));
    if (trackers.length) add("tracking", "info", "radar", `${trackers.length} من أكواد التتبع`, `مثل ${trackers.slice(0, 4).join("، ")}. تكشف للموقع من أين جئت ومن شارك الرابط معك. استعمل النسخة النظيفة أدناه.`, 0);
    result.trackers = trackers; result.clean = cleanU.href;
    return finish(result);
  }

  /* الدرجة: مجموع القرائن، تُحذف الضعيفة إن ثبتت سمعة الموقع، وتُرفع إلى «أرضية» إن أكّد مصدر حيّ الخطر */
  function score(r, live = []) {
    const all = [...r.flags, ...live];
    const reputable = live.some((f) => f.reputable);
    const used = all.filter((f) => !(reputable && f.weak));
    let s = used.reduce((a, f) => a + (f.pts || 0), 0);
    const floor = Math.max(0, ...used.map((f) => f.floor || 0));
    let nestedMax = 0;
    for (const n of r.nested || []) if (n.r && !n.r.error) nestedMax = Math.max(nestedMax, n.r.score || 0);
    if (nestedMax >= 20) s = Math.max(s, nestedMax + (n0(r) ? 10 : 0));
    s = Math.max(s, floor);
    return Math.max(0, Math.min(100, Math.round(s)));
  }
  const n0 = (r) => (r.nested || []).some((n) => n.redirectLike);
  function finish(r) { r.score = score(r); return r; }
  const level = (s) => (s >= 70 ? { k: "danger", label: "خطير جداً، لا تفتحه", icon: "shield-x" } : s >= 45 ? { k: "danger", label: "خطير، لا تفتحه", icon: "shield-x" } : s >= 20 ? { k: "warn", label: "مشبوه، لا تفتحه قبل التأكد", icon: "shield-alert" } : { k: "success", label: "لا توجد علامات خطر واضحة", icon: "shield-check" });

  root.LinkEngine = { analyze, score, level, extract, defang, refang, toUnicode, splitHost, officialOf, platformOf, BRANDS, isIPv4 };
})(typeof window !== "undefined" ? window : globalThis);
