import { Routes } from '@angular/router';
import { HomeComponent } from './views/home/home.component';
import { GameComponent } from './views/game/game.component';

export const routes: Routes = [
    {
        path: '',
        component: HomeComponent
    },
    {
        path: ':id',
        component: GameComponent,
        pathMatch: 'full',
        canActivate: [],
        data: { idPattern: /^[a-zA-Z0-9]{4}$/ }
    },
    {
        path: '**',
        redirectTo: ''
    }
];
