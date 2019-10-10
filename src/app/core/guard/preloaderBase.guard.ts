import {Injectable} from '@angular/core';
import {Observable, of} from 'rxjs';
import {CanActivate} from '@angular/router';
import {Action, createSelector, select, Store} from '@ngrx/store';
import {catchError, filter, map, switchMap, take, tap} from 'rxjs/operators';
import {State} from '@root-store/state';
import {RouterStoreSelectors} from '@root-store/router-store/index';
import {evalData} from '@core/utils/j-utils';
import {Actions, EntityCrudSelectors} from 'ngrx-entity-crud';


export interface PreloaderGuardConfig<T> {
  actions: Actions<T>;
  selectors: EntityCrudSelectors<T, State>;
  redirectPerform: ({id, item: T, routeState}) => Action;
  selectId: (item: T) => string;
  plantId: (id: string, item: Partial<T>) => Partial<T>;
}

/**
 *
 *  === per le pagine di dettaglio, l'istanza selezionata può essere passata direttamente completa di tutte le sue parti o precaricata con l'azione
 *  casi da gestire con le rotte, si ipotizza di partire da una lista di elementi che si vuole selezionare per vederne il dettaglio:
 *     - seleziono un oggetto già completo di tutte le sue parti:
 *         invoco la rotta passando l'istanza nei parametri extra, (senza valorizzare \:id della rotta).
 *         nella pagina di dettaglio viene recuperata l'istanza dai parametri extra.
 *
 *     - seleziono un oggetto NON completo di tutte le parti necessarie nella maschera di dettaglio:
 *         invoco la rotta con \:id
 *         la classe Guard intercetta la rotta
 *             dispaccio l'azione per annullare l'itemSelezionato
 *             crea uno Observer su "selectItemSelected" (annullato in precedenza) e "selectRouteParam('id')", in modo da recuperare il valore dell'id passato e dell'item quando verrà precaricato
 *             se id NON corrisponde all'id nell'item selezionato:
 *               dispaccio "actions.SelectRequest" per precaricare l'elemento
 *               interrompo la propagazione dell'evento cun il filter "selectId(item) === id"
 *             se id  corrisponde all'id nell'item selezionato:
 *               (vuol dire che l'item è stato precaricato)
 *
 */
@Injectable({
  providedIn: 'root'
})
export class PreloaderBaseGuard<T> implements CanActivate {

  protected config: PreloaderGuardConfig<T>;

  constructor(private store$: Store<State>) {
  }


  select<R>(config: PreloaderGuardConfig<T>): Observable<any> {
    // return an Observable stream from the store
    return this.store$.pipe(
      // seleziono l'id passato nella rotta e l'elemento attualmente presente nello store.
      select(createSelector(
        RouterStoreSelectors.selectRouteParam('id'),
        config.selectors.selectItemSelected,
        (id: string, item: T) => ({id, item})
      )),
      // se non esiste l'id propago un errore, che permette alla rotta di proseguire senza precaricare dati
      tap(({id, item}) => {
        // se l'id dell'item attualmete selezionato NON corrisponde a quello passato nella rotta
        // dispaccio l'azione per precaricare il dato.
        if (evalData(() => config.selectId(item).toString() !== id.toString()), true) {
          const searchItem: T = config.plantId(id, {}) as T;
          this.store$.dispatch(config.actions.SelectRequest({item: searchItem}));
        }
      }),
      // se l'id della rotta corrisponde a quello dell'elemento selezionato, procedo
      filter(({id, item}) => evalData(() => config.selectId(item).toString() === id.toString(), false)),
      // viene eseguito solo una volta e deregistrato
      take(1),
      // entro nel metodo che si occupa del redirect.
      map(config.redirectPerform),
      map(this.store$.dispatch),
      // annnullo l'elemento precaricato
      tap(() => this.store$.dispatch(config.actions.SelectItem({item: null})))
    );
  }

  canActivate(): Observable<boolean> {
    return this.select(this.config).pipe(
      switchMap(() => of(false)),
      // catturo l'errore propagato in caso di assenza dell'id, in questo caso proseguo senza precaricare dati.
      catchError(() => of(false))
    );
  }
}