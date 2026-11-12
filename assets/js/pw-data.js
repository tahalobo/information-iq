/* ==========================================================
   بيانات أداة كلمات المرور (كلها محلية، لا تُرسَل لأي مكان)
   - PW_AR_WORDS : كلمات عربية مكتوبة باللاتيني لعبارات المرور (تُختار عشوائياً بالتشفير)
   - PW_IQ_DICT  : قاموس ما يجرّبه المخترق أولاً على حسابات العراقيين والعرب
                   (أسماء، مدن، عشائر، أندية، كلمات دينية وعامية). الأشهر أولاً.
   ========================================================== */
(function () {
  const uniq = (s) => [...new Set(s.trim().split(/\s+/))];

  /* ---------- كلمات عبارات المرور: أحرف لاتينية صغيرة فقط، 3 إلى 8 أحرف ---------- */
  window.PW_AR_WORDS = uniq(`
    shams qamar najma sama ghaym matar thalj reeh barq raad nahr bahr jabal wadi sahra ramla sakhra turab hawa nar
    dukhan nada fajr duha asr ghuroob layl nahar sabah masa rabee sayf khareef shita mawj shati jazeera ghaba bustan hadiqa
    shajara warda zahra waraqa ghusn jidhr bidhra thamara nakhla tamra zaytoon rumman teen inab tuffah mishmish khawkh tout lawz jawz
    fustuq batteekh shammam mawz laymoon burtuqal basal thoom tamata khiyar jazar batata filfil nanaa rayhan zaatar kammoon zanjabeel qirfa hayl
    khubz samoon timman marag dolma kubba kabab masgoof tashreeb bamya fasoolya adas hummus falafel shawarma jibna laban zibda asal dibs
    sukkar milh khall zayt tahin halawa kunafa baqlawa zalabya kleecha qahwa shay haleeb aseer shorba salata bayd lahm dajaj samak
    asad nimr fahd dheeb thaalab dubb feel zarafa jamal hisan himar baqara thawr kharoof maaza ghazal arnab qird qitta kalb
    saqr nasr hamama asfoor bulbul hudhud ghurab batta wazza deek dajaja laqlaq boom babagha nahla namla farasha ankaboot aqrab sulhufat
    hoot dulfin qirsh timsah dhifda halazoon jarad sarsoor khuffash qunfudh sinjab faar tawoos naama baghl jamoos mahr jahsh
    bayt dar ghurfa matbakh hammam sath daraj bab shubbak jidar saqf ard hawsh sirdab makhzan karaj mamarr rukn zawiya
    kursi tawila sareer mikhadda battaniya sajjada sitara mirat khizana raff saa misbah shamaa miftah qufl sandooq sahn koob finjan
    mila sikkeen shawka qidr tawa ibreeq sallah kees haqiba mihfaza qalam daftar kitab waraq mistara mimhat lawha kharita jareeda
    majalla risala zarf tabi khatm sura lawn rasma naghma lahn ughniya oud tabl nay kaman rabab mizmar qasida riwaya
    hikaya mathal lughz hall sual jawab dars fasl saff madrasa jamia maktaba mukhtabar mashgal masnaa mazraa haql bir
    saqiya jisr tareeq shari zuqaq sahat maydan souq dukkan makhbaz matam maqha funduq mathaf masrah malab masbah mahatta
    matar mina qitar sayyara shahina darraja zawraq safina tayyara sarookh ajala muharrik miqwad kabih wuqood naft ghaz kahraba
    dhahab fidda nuhas hadeed rasas qasdeer almas yaqoot zumurrud lulu marjan faroz kahraman zujaj khashab hajar tabooq ismant jiss
    abyad aswad ahmar akhdar azraq asfar bunni ramadi wardi banafsaji burtuqali dhahabi fiddi samawi zayti kuhli nili qurmuzi
    wahid ithnan thalatha arbaa khamsa sitta sabaa thamanya tisaa ashara mia alf malyoon nisf rubu thuluth zawj fard
    kabeer sagheer taweel qaseer areed dayyiq thaqeel khafeef saree batee qawi daeef jadeed qadeem harr barid ratb jaff
    naeem khashin hulw murr hamid malih nazeef jameel hadi sakhib mudee mudhlim qareeb baeed aali wati amiq sathi
    sahl saab ghani kareem shujaa hakeem sabur sadiq ameen wafi labiq nasheet mubdi mahir dhaki fahim hazim adil
    yaktub yaqra yarsum yahsib yabni yazra yahsud yatbukh yakul yashrab yanam yashu yamshi yarkud yaqfiz yasbah yateer yasud
    yanzil yadkhul yakhruj yaftah yughliq yahmil yadfa yashab yarmi yamsik yatruk yajid yabhath yasal yujib yadhak yabtasim
    yufakkir yatadhakkar yansa yataallam yuallim yusafir yaud yantazir yusaid yahmi yuhibb yashkur yusalli yasoom yughanni yarqus yalab
    ras wajh ayn udhun anf famm sinn lisan raqaba katif dhiraa kaff isba dhufr sadr qalb dhahr batn rukba qadam
    ab umm ibn bint akh ukht jadd jadda amm khal sadeeq jar dayf tifl shabb shaykh muallim tabeeb muhandis
    najjar haddad khabbaz khayyat fallah sayyad tajir saiq tayyar bahhar jundi dabit qadi muhami katib shair rassam mughanni
    dijla furat babil sumer ashur akkad nineveh samarra hatra warka zaqqura mesopot tigris sinbad shahrazad aladdin gilgamesh enkidu ishtar
    qalaa qasr burj soor minara qubba mihrab minbar saha nafoora tamathil athar naqsh zakhrafa fusayfisa khazaf fakhar hasir
    thawb qamees sirwal mitaf qubbaa hidha jawrab hizam wishah abaya dishdasha yashmagh iqal khatam siwar qilada qurt nadhara
    sayf rumh qaws sahm diri khawdha raya alam tabool nafeer faris fursan qafila khayma bousala najm kawkab falak
    madar majarra kusoof khusoof shihab nayzak fadaa jadhibiya daw dhill sada samt hams hamsa nabd nafas hulm amal
    farah salam aman hurriya karama izza majd nasr fawz sabr shukr hubb wafa sidq adl ilm fann fikr
    raqm harf kalima jumla satr safha fihris unwan tareekh yawm shahr sana qarn lahdha daqiqa thaniya usboo mawid
    hasoob shasha lawhat fara tabia hatif shahin battariya silk qabis mawja ishara shabaka mawqi barid ramz shifra miftahi
  `).filter((w) => /^[a-z]{3,8}$/.test(w));

  /* ---------- قاموس الفاحص: الأشهر أولاً (الترتيب = سهولة التخمين) ---------- */
  window.PW_IQ_DICT = uniq(`
    iraq iraqi baghdad ali mohammed muhammad mohamed mohammad ahmed ahmad hussein hussain husain hasan hassan allah habibi
    fatima fatma zahraa zahra zainab zaynab abbas mustafa mostafa omar umar yousif yousef yusuf ibrahim karrar haider haidar hayder
    mahdi mehdi sajad sajjad baqir kadhim kadhum kazem jawad murtadha murtada montadhar muntadher hamza othman osman khalid khaled
    abdullah abdallah abdulla abdulrahman abdalrahman saif seif zaid zayd ammar anas bilal tariq tareq waleed walid saad saeed
    said salam salim salem samir sameer sami karim kareem rahim raheem jasim jassim qasim kassim hashim hashem nasir nasser
    nabil nabeel majid majeed hamid hameed mahmoud mahmood maytham maitham laith layth firas feras yasir yasser yaser adnan
    marwan mazin mazen muhanad mohanad moamal muammal ameer amir amer emad imad ihab ehab ayman aymen bashar basim
    bassam dhiaa diaa fadhil fadel faisal faysal ghassan ghazi haitham haytham hazim hisham hesham ismail ismael jaafar jafar
    jalal jamal kamal kamil maher mahir malik mansour mansoor muayad munir muneer nawaf nizar raad raed rami ramy
    rasool rasul riyadh riyad sabah sadiq sadeq safaa safa salah salman sattar sinan sufyan taha thamer wisam wissam
    yahya zaki ziad ziyad zuhair aqeel akeel alaa ali123 hadi haidari mousa musa issa isa noor nour nur
    noora nora huda hoda maryam mariam maream sara sarah zeinab ruqaya ruqayya roqaya aya ayah aisha aysha ayesha
    amna amina aminah khadija hawraa hawra banin baneen tabarak tuqa tuka rand rania ranya reem rim rawan rahma
    shahad shahd duaa doaa esraa israa asmaa asma hala hanan haneen hanin iman eman dina dena dalia farah
    ghada ghadeer ghufran hajar jannat jana kawthar kauthar lamia layla leila laila lina leen lubna malak mina
    mona muna nada nadia narjis nargis nisreen nawal rasha rusul rosul rua ruaa sabreen safia sajida samar
    sana sanaa shaimaa shaymaa suha suhad tamara teeba tiba wafaa yasmin yasmeen zahraa123 zina zeena zubaida abeer
    basra basrah mosul erbil arbil hawler najaf karbala kerbala kirkuk sulaymaniyah sulaimaniya duhok dohuk nasiriyah nasiriya amara
    amarah maysan missan diwaniyah diwaniya hilla hillah babil babylon kut wasit samawah samawa muthanna ramadi anbar fallujah
    falluja tikrit samarra baquba baqubah diyala dhiqar thiqar qadisiyah salahuddin ninawa nineveh zakho halabja kufa kadhimiya kadhimiyah
    adhamiya adhamiyah karrada karada mansour sadrcity zayouna jadriya dora shaab shula hurriya mesopotamia rafidain tigris euphrates dijla
    furat sumer iraqia aliraq al3iraq 3iraq 3ali 7ussein 7usain 7abibi 7abibti mo7amed a7med 7asan 7aider
    yaallah yaali yahussein yahussain yazahra yamahdi yaabbas labaik labayk bismillah alhamdulillah mashallah inshallah subhanallah allahuakbar astaghfirullah muhammadrasulallah
    islam muslim quran koran mecca makkah madina kaaba ramadan eid hajj imam sayed sayyed sayid sheikh shaikh
    haji hajji alawi mousawi musawi husseini hussaini hashimi hashemi tamimi rubaie rubaye jubouri juburi jbouri dulaimi dulaimy
    zubaidi zubaydi obeidi obaidi ubaidi shammari shamari saadi khafaji khazraji rikabi maliki sudani asadi kaabi tai
    janabi azzawi azawi samarrai samarai tikriti mosuli basri baghdadi najafi karbalai kurdi kurdistan barzani talabani amiri bayati
    hilali lami saedi mayahi darraji daraji zaidi zamili ghazzi fatlawi shimmari anzi enezi ezzi habib habibti
    habibty hayati hayaty omri umri 3omri roohi rouhi rohi galbi qalbi albi 7ayati hobi hubi hubbi
    ahebak ahibak a7ebak ahbak bahebak uhibuk ahebek aheb love iloveyou iloveu ana anaw inta enta enti
    wallah walla yalla yallah shlonak shlonik shaku maku zain zein hello mama baba yuma yaba akhi
    ukhti okhti ibni binti jiddi sadiqi sadeeqi watan watani alwatan aliraqi iraqna asad aliasad haydar haydari
    zawraa zawra alzawraa shorta alshorta jawiya quwa talaba altalaba minaa almina naft alnaft karkh alkarkh duhokfc erbilfc
    usoodalrafidain younis younismahmoud nashat akram hawar ammo baba realmadrid barcelona barca madrid messi ronaldo cr7 neymar
    mbappe salah liverpool chelsea arsenal juventus milan bayern hala halamadrid forcabarca visca juve manunited mancity
    zain zainiraq asiacell korek korektel earthlink newroz fastlink itisaluna alkafeel qicard kicard zaincash asiahawala
    facebook instagram telegram whatsapp tiktok snapchat youtube google gmail yahoo hotmail pubg pubgmobile freefire fortnite
    minecraft roblox callofduty clashofclans fifa gta playstation samsung iphone huawei xiaomi toyota nissan kia hyundai
    khalas mafi mako aku hwaya kulish shukran afwan marhaba ahlan salamu alaikum alsalam assalam sabah masa
    محمد علي حسين حسن احمد أحمد فاطمة زهراء زينب عباس مهدي كرار حيدر مصطفى عمر يوسف ابراهيم مريم نور
    سارة هدى الله العراق عراق عراقي بغداد البصرة بصرة الموصل اربيل النجف كربلاء كركوك بابل ذيقار ميسان
    حبيبي حبيبتي حياتي عمري روحي قلبي احبك أحبك ياعلي ياحسين يازهراء يامهدي ياالله بسمالله الحمدلله ماشاءالله
    انشاءالله سبحانالله اللهاكبر كلمةالسر كلمةالمرور الرقمالسري باسورد سري الزوراء الشرطة ريالمدريد برشلونة ميسي رونالدو
    ضصثق شسيب ضصثقفغ شسيبلات ئءؤر ضصثقفغعهخح
  `);
})();
