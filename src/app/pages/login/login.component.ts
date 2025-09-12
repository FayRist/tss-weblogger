import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';

import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule
  ]
})
export class LoginComponent {
  username = '';
  password = '';
  isLoading = false;
  errorMsg = '';

  constructor(private auth: AuthService, private router: Router) {}

  // ใช้แทน navigateToMainPage() เดิมบนปุ่ม
  navigateToMainPage() {
    this.onSubmit();
  }

  onSubmit() {
    this.errorMsg = '';
    this.isLoading = true;
    const { ok, error } = this.auth.login(this.username.trim(), this.password);
    this.isLoading = false;
    if (!ok) { this.errorMsg = error ?? 'Login failed'; return; }
    this.router.navigate(['/pages/dashboard']);
  }
}
