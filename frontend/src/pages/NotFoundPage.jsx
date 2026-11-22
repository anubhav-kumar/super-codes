import NotFoundState from '../components/NotFoundState.jsx';
import PageBody from '../components/PageBody.jsx';

/** Unknown address inside the signed-in shell (signed out, RequireAuth sends it to Sign in). */
export default function NotFoundPage() {
    return (
        <PageBody width="narrow">
            <NotFoundState />
        </PageBody>
    );
}
