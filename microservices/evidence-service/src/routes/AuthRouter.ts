import { Router } from 'express';
import { AuthController } from '../controllers/AuthController.js';
import { AuthMiddleware } from '../middleware/AuthMiddleware.js';

export class AuthRouter {
  private router: Router;
  private controller: AuthController;
  private auth: AuthMiddleware;

  constructor() {
    this.router = Router();
    this.controller = new AuthController();
    this.auth = new AuthMiddleware();
    this.init();
  }

  private init() {
    // First user bootstrap: allow register if no users exist, otherwise require admin. For now, open register.
    this.router.post('/register', this.controller.register.bind(this.controller));
    this.router.post('/login', this.controller.login.bind(this.controller));
    this.router.post('/refresh', this.controller.refresh.bind(this.controller));
    this.router.post('/logout', this.auth.authenticate.bind(this.auth), this.controller.logout.bind(this.controller));
    this.router.get('/me', this.auth.authenticate.bind(this.auth), this.controller.me.bind(this.controller));

    // Admin: list users
    this.router.get(
      '/users',
      this.auth.authenticate.bind(this.auth),
      this.auth.authorize(['admin']),
      this.controller.listUsers.bind(this.controller)
    );
  }

  public getRouter(): Router { return this.router; }
}

export default AuthRouter;
