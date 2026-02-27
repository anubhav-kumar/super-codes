defmodule LiveBettingWeb.PayoutLive.Form do
  use LiveBettingWeb, :live_view

  alias LiveBetting.Betting
  alias LiveBetting.Betting.Payout

  @impl true
  def render(assigns) do
    ~H"""
    <Layouts.app flash={@flash}>
      <.header>
        {@page_title}
        <:subtitle>Use this form to manage payout records in your database.</:subtitle>
      </.header>

      <.form for={@form} id="payout-form" phx-change="validate" phx-submit="save">
        <.input field={@form[:weight_share_pct]} type="number" label="Weight share pct" step="any" />
        <.input field={@form[:gross_payout]} type="number" label="Gross payout" step="any" />
        <.input field={@form[:status]} type="text" label="Status" />
        <.input field={@form[:paid_at]} type="datetime-local" label="Paid at" />
        <footer>
          <.button phx-disable-with="Saving..." variant="primary">Save Payout</.button>
          <.button navigate={return_path(@return_to, @payout)}>Cancel</.button>
        </footer>
      </.form>
    </Layouts.app>
    """
  end

  @impl true
  def mount(params, _session, socket) do
    {:ok,
     socket
     |> assign(:return_to, return_to(params["return_to"]))
     |> apply_action(socket.assigns.live_action, params)}
  end

  defp return_to("show"), do: "show"
  defp return_to(_), do: "index"

  defp apply_action(socket, :edit, %{"id" => id}) do
    payout = Betting.get_payout!(id)

    socket
    |> assign(:page_title, "Edit Payout")
    |> assign(:payout, payout)
    |> assign(:form, to_form(Betting.change_payout(payout)))
  end

  defp apply_action(socket, :new, _params) do
    payout = %Payout{}

    socket
    |> assign(:page_title, "New Payout")
    |> assign(:payout, payout)
    |> assign(:form, to_form(Betting.change_payout(payout)))
  end

  @impl true
  def handle_event("validate", %{"payout" => payout_params}, socket) do
    changeset = Betting.change_payout(socket.assigns.payout, payout_params)
    {:noreply, assign(socket, form: to_form(changeset, action: :validate))}
  end

  def handle_event("save", %{"payout" => payout_params}, socket) do
    save_payout(socket, socket.assigns.live_action, payout_params)
  end

  defp save_payout(socket, :edit, payout_params) do
    case Betting.update_payout(socket.assigns.payout, payout_params) do
      {:ok, payout} ->
        {:noreply,
         socket
         |> put_flash(:info, "Payout updated successfully")
         |> push_navigate(to: return_path(socket.assigns.return_to, payout))}

      {:error, %Ecto.Changeset{} = changeset} ->
        {:noreply, assign(socket, form: to_form(changeset))}
    end
  end

  defp save_payout(socket, :new, payout_params) do
    case Betting.create_payout(payout_params) do
      {:ok, payout} ->
        {:noreply,
         socket
         |> put_flash(:info, "Payout created successfully")
         |> push_navigate(to: return_path(socket.assigns.return_to, payout))}

      {:error, %Ecto.Changeset{} = changeset} ->
        {:noreply, assign(socket, form: to_form(changeset))}
    end
  end

  defp return_path("index", _payout), do: ~p"/payouts"
  defp return_path("show", payout), do: ~p"/payouts/#{payout}"
end
