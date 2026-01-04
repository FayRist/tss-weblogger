import { bootstrapApplication, BrowserModule } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { provideRouter, withHashLocation, withRouterConfig } from '@angular/router';
import { routes } from './app/app.routes';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';

import { provideToastr } from 'ngx-toastr';

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(
      routes,
      withHashLocation(),
      withRouterConfig({ onSameUrlNavigation: 'reload' })  // ✅ อนุญาตให้ reload component เมื่อ navigate ไปยัง route เดิม
    ),
    provideHttpClient(),      // ✅ แทน HttpClientModule
    provideAnimations(),      // ✅ ต้องมี (หรือใช้ provideAnimationsAsync())
    provideToastr(),          // ✅ แทน ToastrModule.forRoot()
  ],
}).catch(console.error);
