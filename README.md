# داشبورد KPI جیرا

این پروژه یک داشبورد محلی، فارسی و راست‌به‌چپ برای گزارش KPI تیم‌های توسعه نرم‌افزار و QA است. فایل خروجی Jira، فایل ظرفیت تیم و سند KPI با فرمت DOCX در مرورگر خوانده می‌شوند و گزارش مدیریتی، داشبورد افراد، نمودارها، جدول جزئیات، کیفیت داده و تاریخچه گزارش ساخته می‌شود.

## فناوری‌ها

- HTML5، CSS3 و Vanilla JavaScript
- ES Modules بدون build step
- IndexedDB برای ذخیره محلی تاریخچه، نگاشت‌ها، تنظیمات و تعطیلات
- Chart.js، SheetJS، Mammoth.js و idb به صورت فایل محلی در `assets/vendor`
- بدون React، Vue، Angular، TypeScript، Webpack یا Vite
- اجرای پیش‌فرض همچنان build-free و فقط با `python -m http.server 8080` است؛ برای ذخیره‌سازی PostgreSQL یک سرور Node.js اختیاری وجود دارد.

## روش اجرا

از ریشه پروژه اجرا کنید:

```bash
python -m http.server 8080
```

سپس مرورگر را باز کنید:

```text
http://localhost:8080
```

باز کردن مستقیم `index.html` با `file://` توصیه نمی‌شود، چون مرورگرها معمولا ES Moduleها را در این حالت محدود می‌کنند. VS Code Live Server هم قابل استفاده است.

### اجرای اختیاری با PostgreSQL

برای ذخیره دائمی تاریخچه گزارش‌ها در PostgreSQL، وابستگی‌ها را نصب و سرور اختیاری را اجرا کنید:

```bash
npm install
DATABASE_URL=postgres://user:password@localhost:5432/jira_kpi npm run serve:postgres
```

در PowerShell:

```powershell
$env:DATABASE_URL="postgres://user:password@localhost:5432/jira_kpi"
npm run serve:postgres
```

این سرور همان فایل‌های استاتیک داشبورد را سرو می‌کند و APIهای `/api/reports` را برای ذخیره، فهرست، بازیابی و حذف گزارش‌ها فراهم می‌کند. اگر داشبورد را همچنان با `python -m http.server 8080` اجرا می‌کنید و API را روی پورت دیگری بالا آورده‌اید، مقدار پایه API را در مرورگر تنظیم کنید:

```js
localStorage.setItem("jiraKpiApiBase", "http://127.0.0.1:3000");
```

اگر API در دسترس نباشد، برنامه به صورت خودکار از IndexedDB مرورگر استفاده می‌کند.

## حریم خصوصی

در اجرای پیش‌فرض با `python -m http.server 8080` همه پردازش‌ها داخل مرورگر انجام می‌شود و داده‌ها در IndexedDB ذخیره می‌شوند. در اجرای اختیاری PostgreSQL، گزارش کامل محاسبه‌شده از طریق API محلی `/api/reports` در پایگاه داده ذخیره و بعدا بازیابی می‌شود.

## معماری

پروژه با الگوی MVC سمت کلاینت ساخته شده است:

- Model: مدل گزارش، Jira، ظرفیت، KPI و نگاشت‌ها
- View: رندر فرم‌ها، کارت‌ها، نمودارها، جدول‌ها، تاریخچه و کیفیت داده
- Controller: رویدادهای فایل، نگاشت، تولید گزارش، فیلترها، تاریخچه و import/export
- Services: پارسرها، نرمال‌سازی، محاسبات KPI، IndexedDB، تعطیلات، کیفیت داده و خروجی‌ها

## ساختار پوشه

```text
index.html
assets/css/
assets/js/config/
assets/js/controllers/
assets/js/models/
assets/js/views/
assets/js/services/
assets/js/utils/
assets/vendor/
tests/test-runner.html
sample-data/
```

## بارگذاری اولین گزارش

1. در بخش «بارگذاری»، فایل Jira، فایل ظرفیت و فایل KPI DOCX را انتخاب کنید.
2. دکمه «خواندن و پیش‌نمایش» را بزنید.
3. در بخش «نگاشت‌ها»، ستون‌های Jira و افراد را بررسی کنید.
4. نگاشت فیلدها و افراد را ذخیره کنید.
5. نام تیم و اسپرینت را وارد کنید و «تولید گزارش» را بزنید.

اگر ستون Sprint در Jira وجود نداشته باشد، نام شیت اصلی Jira به عنوان نام اسپرینت پیشنهاد می‌شود.

## نگاشت‌ها

نگاشت فیلدها از aliasهای قابل ویرایش در `assets/js/config/field-aliases.js` استفاده می‌کند. نگاشت افراد ظرفیت، نام Jira، نقش و ستون Work Log را به هم وصل می‌کند و در IndexedDB ذخیره می‌شود. اگر فرد جدید یا ستون ظرفیت بدون نام دیده شود، در صفحه نگاشت قابل تنظیم است.

## فرمول‌های KPI

- Capacity Utilization مدیریت: حجم کار planned/unplanned توسعه و تست تقسیم بر ظرفیت کل یکتای افراد
- Planned / Unplanned / Carry Over Work: جمع `Dev Estimate + Test Estimate`
- Delivery Rate Develop: آیتم‌های planned/unplanned با وضعیت توسعه تکمیل‌شده تقسیم بر کل planned/unplanned
- Delivery Rate: آیتم‌های Done تقسیم بر کل planned/unplanned
- Submitted to QA: وجود مقدار معتبر در `FirstAutomationTest`
- QA Return Rate: کلیدهای مشترک Jira و QA Return تقسیم بر Submitted to QA
- First Pass Rate: Submitted minus Returned تقسیم بر Submitted
- Hotfix و Bug Fix: فقط از labelهای نرمال‌شده
- Lead Time: `Done Date - Created`
- Cycle Time: `Done Date - FirstInProgress`
- Blocked Time: جمع `Time in block`
- Estimation Accuracy: تخمین تقسیم بر Work Logged، بدون clamp به 100
- Time Variance: `Work Logged - (Dev Estimate + Test Estimate)` ذخیره می‌شود ولی کارت اصلی نیست.

KPIهای Rework Rate، Average WIP و Average Story Size در نبود داده لازم با `N/A` و دلیل شفاف نمایش داده می‌شوند.

## واحد زمان و تقویم کاری ایران

`Available Capacity`، `DevEstimat` و `TestEstimat` ساعت هستند. Work Log و Blocked Time اگر به صورت کسر روز Excel باشند به ساعت تبدیل می‌شوند: `0.0416666667 = 1h` و `0.125 = 3h`.

تقویم کاری پیش‌فرض:

- منطقه زمانی: `Asia/Tehran`
- ساعت کاری: 08:00 تا 17:00
- آخر هفته: پنجشنبه و جمعه
- تعطیلات رسمی از تنظیمات محلی خوانده می‌شود و به API اینترنتی وابسته نیست.

در بخش «تعطیلات و تنظیمات» می‌توانید تعطیلی اضافه، ویرایش، غیرفعال، import یا export کنید.

## تاریخچه و پشتیبان

گزارش‌ها در حالت پیش‌فرض در IndexedDB با storeهای زیر ذخیره می‌شوند:

`reports`, `jiraDatasets`, `capacityDatasets`, `kpiConfigurations`, `fieldMappings`, `personMappings`, `metricResults`, `holidays`, `dataQualityIssues`, `settings`

از بخش تاریخچه می‌توانید گزارش را باز، حذف یا تنظیماتش را کپی کنید. دکمه «خروجی پشتیبان» کل داده محلی را JSON می‌کند و «بازیابی پشتیبان» همان JSON را برمی‌گرداند. «حذف همه داده‌ها» کل IndexedDB پروژه را پس از تایید پاک می‌کند.

در حالت PostgreSQL، تاریخچه از جدول `jira_kpi_reports` خوانده می‌شود و باز کردن هر گزارش، نسخه کامل JSONB همان گزارش را از API بازیابی می‌کند. حذف گزارش در این حالت soft delete است: گزارش از تاریخچه عادی پنهان می‌شود، اما ردیف پایگاه داده با `deleted_at` برای ممیزی باقی می‌ماند.

## Export و Import

- خروجی گزارش کامل به JSON از پشتیبان محلی
- خروجی Excel گزارش فعال شامل خلاصه، KPIهای مدیریتی، KPIهای افراد، Issueها، کیفیت داده و ممیزی
- خروجی جدول Issueها به CSV با محافظت در برابر formula injection
- خروجی و ورود نگاشت افراد JSON
- خروجی و ورود تعطیلات JSON
- پشتیبان کامل و بازیابی کامل

## آزمون‌ها

بعد از اجرای سرور محلی، باز کنید:

```text
http://localhost:8080/tests/test-runner.html
```

آزمون‌ها نرمال‌سازی اعداد فارسی/عربی، برچسب‌ها، وضعیت‌ها، واحدهای Excel، KPIها، تقسیم بر صفر، ظرفیت QA با Carry Over و تقویم کاری را بررسی می‌کنند. چون در workspace فایل نمونه وجود نداشت، آزمون‌های پارسر فایل با امضای باینری و بررسی‌های synthetic اجرا می‌شوند.

## عیب‌یابی

- اگر صفحه خالی است، مطمئن شوید از `python -m http.server 8080` یا Live Server استفاده می‌کنید.
- اگر XLS قدیمی با پسوند XLSX دارید، parser امضای باینری را بررسی می‌کند و فقط به پسوند تکیه نمی‌کند.
- اگر KPI مقدار `N/A` دارد، بخش «کیفیت داده» یا متن دلیل روی کارت را بررسی کنید.
- اگر Work Logged بیش از حد بزرگ شد، مطمئن شوید ستون total و ستون‌های فردی با هم جمع نشده‌اند.
- اگر Lead/Cycle Time غیرمنتظره است، تعطیلات و ساعت کاری را در تنظیمات بررسی کنید.

## محدودیت واقعی

اعتبارسنجی واقعی با فایل‌های زیر انجام شد:

- `sample-data/jira.xlsx`: فرمت واقعی ZIP/XLSX، شیت‌ها: `sprint 26.1` و `QA Return `
- `sample-data/capacity.xlsx`: پسوند `.xlsx` دارد اما فرمت واقعی OLE/XLS است. شیت: `ظرفیت `
- `sample-data/kpi.docx`: فرمت واقعی ZIP/DOCX، شامل 2 جدول و 18 تعریف KPI

## ساختار واقعی فایل‌ها

Jira دارای 131 ردیف و 27 ستون در شیت اصلی است. 130 issue غیرخالی، 130 کلید یکتا، بدون کلید تکراری و بدون ردیف فاقد کلید شناسایی شد. هدرهای دارای فاصله اول/آخر مانند ` FirstInProgress` و ` Done Date` با trim به `FirstInProgress` و `Done Date` نگاشت شدند.

هدرهای واقعی مهم:

`Issue Type`, `Key`, `Summary`, `Status`, `TestEstimat`, `DevEstimat`, `Fix Version/s`, `Assignee`, `Labels`, `Planned Release Management Task`, `Time Spent`, `Contact point`, `FirstInProgress`, `FirstAutomationTest`, `Σ Time Spent`, `Σ Work Logged AmirReza`, `Work Logged Omid`, `Work Logged mozhdeh`, `Work Logged behzad`, `Work Today abbas`, `Work Logged sepideh`, `Work Today Ali`, `Time in Status`, `Done Date`, `Created`, `Time in block`, `Story Points`

وضعیت‌های واقعی:

`Automatic Test`, `Done`, `Draft`, `In Progress`, `Manual Test`, `Ready`, `Suspended`

نوع برنامه واقعی:

`Plan`, `Unplan`, و مقدار خالی که به `carry_over` نگاشت می‌شود.

Labelهای واقعی شامل `hotfix`, `bugfix`, `technical`, `meeting`, `block` و اولویت‌هایی مانند `p1` تا `p17` هستند.

## نتیجه QA Return واقعی

شیت `QA Return ` شامل 10 کلید یکتا است. 7 کلید با دیتاست اصلی اسپرینت match شدند و 3 کلید بیرون از دیتاست اصلی به عنوان هشدار کیفیت داده گزارش شدند:

`RCA-3299`, `RCA-3288`, `PODCM-4922`

کلیدهای match شده:

`PODCM-4769`, `PODCM-4768`, `PODCM-4760`, `PODCM-4741`, `PODCM-4634`, `PODCM-4565`, `PODCM-4556`

## رفتار واقعی فایل ظرفیت

فایل ظرفیت legacy XLS/OLE است، هرچند نام آن `capacity.xlsx` است. parser امضای باینری را تشخیص می‌دهد و به پسوند تکیه نمی‌کند. 23 ردیف، 8 ستون، 3 merge range و 21 formula cell با cached values شناسایی شد. فرمول‌ها اجرا نمی‌شوند؛ فقط cached value خوانده می‌شود.

ردیف‌های summary واقعی:

- Total: `کل ةرفیت`
- Technical: `Technical`
- Planned: `ظرفیت پلن`
- Unplanned: `ظرفیت آنپلن`

هدر merged واقعی `سپیده -علی(test)` به دو ستون جدا تقسیم می‌شود: `سپیده` و `علی`.

## نگاشت واقعی افراد

| ظرفیت | Jira | نقش | Work Log |
|---|---|---|---|
| امید | Omid Dehghan | developer | Work Logged Omid |
| مژده | Masoumeh Mosavi | developer | Work Logged mozhdeh |
| بهزاد | Behzad Amirian | developer | Work Logged behzad |
| امیر رضا | Amirreza Azizi | developer | Σ Work Logged AmirReza |
| عباس | Abbas Zamadi | developer | Work Today abbas |
| سپیده | Sepideh Kolahdooz | qa | Work Logged sepideh |
| علی | Ali Bahrampour | qa | Work Today Ali |

## رفتار واقعی واحدهای زمانی

ستون‌های Work Log، `Σ Time Spent` و `Time in block` با فرمت Excel `[h]:mm` آمده‌اند. parser اکنون metadata سلول شامل raw value، نوع سلول، number format و متن نمایشی را نگه می‌دارد و برای فرمت duration، کسر روز Excel را در 24 ضرب می‌کند. برای مثال `0.3125` با نمایش `7:30` به 7.5 ساعت تبدیل می‌شود.

ستون‌های `DevEstimat` و `TestEstimat` مقدار ساعت مستقیم هستند و در 24 ضرب نمی‌شوند.

## صفحه اعتبارسنجی داده واقعی

بعد از اجرای سرور محلی، این صفحه را باز کنید:

```text
http://localhost:8080/tests/real-data-validation.html
```

این صفحه فایل‌های `sample-data` را با `fetch` می‌خواند، همان parserها و calculation serviceهای production را اجرا می‌کند، pass/fail، ساختار فایل‌ها، نگاشت‌ها، KPIها و کیفیت داده را نشان می‌دهد و خروجی JSON می‌دهد.

برای اجرای command-line اعتبارسنجی:

```bash
node --experimental-default-type=module tests/run-real-data-validation.cjs
```

خروجی JSON در `tests/real-data-validation-result.json` ذخیره می‌شود.

## نتیجه اعتبارسنجی واقعی

- Real-data validation: 13/13 passed
- Browser/Node tests: 54/54 passed
- Data Quality: 10 info و 3 warning و 0 error
- خطاهای بحرانی وجود ندارد.

## چک‌لیست UI

اتصال browser automation در این session در دسترس نبود، بنابراین QA تصویری خودکار انجام نشد. موارد زیر باید در مرورگر بررسی شوند:

- پیش‌نمایش upload سه فایل را نشان دهد.
- متن فارسی و RTL درست باشد.
- نگاشت افراد شامل 7 نفر و QA merged split باشد.
- کارت‌های مدیریت عدد واقعی نشان دهند.
- داشبوردهای developer و QA نمایش داده شوند.
- نمودارها با مقدار عددی و `N/A` بدون خطا render شوند.
- جدول issueها صفحه‌بندی، جستجو، sort و CSV export داشته باشد.
- فیلترها کارت‌ها و جدول را به‌روز کنند.
- تاریخچه IndexedDB گزارش را ذخیره و دوباره باز کند.
- هشدارهای کیفیت داده دیده شوند.
